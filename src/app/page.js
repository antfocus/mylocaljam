'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getVenueColor, groupEventsByDate } from '@/lib/utils';
import { requestNotificationPermission, scheduleReminder, cancelReminder, rehydrateReminders, notificationsGranted } from '@/lib/notifications';

import HeroSection       from '@/components/HeroSection';
import EventCardV2       from '@/components/EventCardV2';
import SavedGigCard      from '@/components/SavedGigCard';
import MapView           from '@/components/MapView';
import SubmitEventModal  from '@/components/SubmitEventModal';
import AuthModal         from '@/components/AuthModal';
import WelcomeModal      from '@/components/WelcomeModal';
// ReportIssueModal replaced by inline flag bottom-sheet in EventCardV2
import Toast             from '@/components/Toast';
// FollowSnackbar removed — follow upsell now handled inline in EventCardV2
import FollowingTab      from '@/components/FollowingTab';
import ArtistProfileScreen from '@/components/ArtistProfileScreen';
// FilterBar removed — filters now live in the omnibar panel

// ── Helpers ──────────────────────────────────────────────────────────────────
// Clean HTML entities that may have leaked through scrapers (e.g. &amp; → &)
function decodeEntities(str) {
  if (!str || typeof str !== 'string') return str;
  const el = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (el) { el.innerHTML = str; return el.value; }
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

// ── Theme ────────────────────────────────────────────────────────────────────
const DARK = {
  bg:           '#0D0D12',
  surface:      '#1A1A24',
  surfaceAlt:   '#22222E',
  border:       '#2A2A3A',
  borderLight:  '#22222E',
  text:         '#F0F0F5',
  textMuted:    '#7878A0',
  textSubtle:   '#4A4A6A',
  accent:       '#E8722A',
  accentAlt:    '#3AADA0',
  navBg:        '#12121A',
  inputBg:      '#22222E',
  pillBg:       '#1A1A24',
  pillBorder:   '#3A3A50',
  dropdownBg:   '#1E1E2E',
  shimmer:      '#22222E',
};

const LIGHT = {
  bg:           '#F7F5F2',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F9FAFB',
  border:       '#E5E7EB',
  borderLight:  '#F3F4F6',
  text:         '#1F2937',
  textMuted:    '#6B7280',
  textSubtle:   '#9CA3AF',
  accent:       '#E8722A',
  accentAlt:    '#3AADA0',
  navBg:        '#FFFFFF',
  inputBg:      '#F3F4F6',
  pillBg:       '#FFFFFF',
  pillBorder:   '#E5E7EB',
  dropdownBg:   '#FFFFFF',
  shimmer:      '#F3F4F6',
};

// ── Date filter options ───────────────────────────────────────────────────────
const DATE_OPTIONS = [
  { key: 'all',      label: 'Any time'      },
  { key: 'today',    label: 'Today'        },
  { key: 'tomorrow', label: 'Tomorrow'     },
  { key: 'weekend',  label: 'Weekend'      },
  { key: 'pick',     label: 'Date'          },
];

// ── Shortcut pills — each defines venue-name matches and/or text search terms ──
// Material icon SVG paths for each pill (24x24 viewBox)
// Material icon name → SVG path lookup (24x24 viewBox)
const MATERIAL_ICON_PATHS = {
  local_fire_department: 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z',
  beach_access: 'M13.127 14.56l1.43-1.43 6.44 6.443L19.57 21zm.707-2.136l-.707.707 8.485 8.486.707-.707zm-4.348-.63l-.353.354 2.828 2.828.354-.353a7.998 7.998 0 00-2.83-2.83zM6.55 5.275L2.126 9.698l.707.707L7.26 5.982zM4.968 8.99l.707.708 4.243-4.243-.707-.707zM8.507 3.45l4.425 4.425-.707.707L7.8 4.16zM14 10a4.009 4.009 0 00-2.392-3.661l-.382.956A3.005 3.005 0 0113 10h1z',
  sports_bar: 'M4 3h13v2H4zm11 7V8H6v2c0 3.61 2.53 6.64 5.91 7.42L11 21H8v2h9v-2h-3l-.91-3.58C16.47 16.64 19 13.61 19 10V8h-2v2c0 2.76-2.24 5-5 5s-5-2.24-5-5zm6-2h2v2c0 1.47-.52 2.82-1.38 3.88L18 12.62V8z',
  music_note: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.22 0-4.01 1.79-4.01 4.01S7.79 21 10.01 21 14 19.21 14 17V7h4V3h-6z',
  mic: 'M9.22 7C9.09 6.69 9 6.36 9 6c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3c-.36 0-.69-.09-1-.22L9.22 7zM20 2v14.5c0 1.38-1.12 2.5-2.5 2.5S15 17.88 15 16.5s1.12-2.5 2.5-2.5c.42 0 .81.1 1.16.28L20 2z',
  restaurant: 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
  label: 'M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z',
  search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  schedule: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  // Material: mic (karaoke)
  karaoke_mic: 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
  // Material: quiz (trivia)
  quiz: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z',
  // Material: local_offer (specials/deals)
  local_offer: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
  // Material: location_on (venue pin)
  location_on: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
};

// ── Haversine distance (miles) between two lat/lng points ──────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Entity Bottom Sheet (Phase 2 — venue/artist profile slide-up) ──────────
function EntityBottomSheet({ type, name, events, darkMode, isFollowing, onFollow, onUnfollow, onClose }) {
  const t = darkMode ? DARK : LIGHT;
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleFollowToggle = () => {
    if (isFollowing) onUnfollow();
    else onFollow();
  };

  // Find upcoming events for this entity
  const entityEvents = useMemo(() => {
    if (!events || !name) return [];
    const today = new Date().toISOString().split('T')[0];
    return events
      .filter(e => {
        if (type === 'venue') return (e.venue || e.venue_name || '').toLowerCase() === name.toLowerCase();
        return (e.name || e.artist_name || '').toLowerCase() === name.toLowerCase();
      })
      .filter(e => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);
  }, [events, name, type]);

  const isVenue = type === 'venue';

  return (
    <>
      <div onClick={handleClose} style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: darkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }} />
      <div ref={sheetRef} style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, 100%)',
        width: '100%', maxWidth: '480px', zIndex: 1600,
        background: t.surface,
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        maxHeight: '55vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.textSubtle }} />
        </div>
        <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px' }}>{isVenue ? '📍' : '🎤'}</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{name}</span>
            </div>
            <div style={{ fontSize: '13px', color: t.textMuted, paddingLeft: '28px' }}>
              {entityEvents.length > 0 ? `${entityEvents.length} upcoming show${entityEvents.length !== 1 ? 's' : ''}` : 'No upcoming shows'}
            </div>
          </div>
          <button onClick={handleFollowToggle} style={{
            padding: '8px 18px', borderRadius: '10px', cursor: 'pointer',
            border: isFollowing ? 'none' : `1.5px solid ${t.accent}`,
            background: isFollowing ? (darkMode ? '#2A2A3A' : '#E5E7EB') : 'transparent',
            color: isFollowing ? '#8DD888' : t.accent,
            fontSize: '13px', fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {isFollowing ? 'Following ✓' : '+ Follow'}
          </button>
        </div>

        {entityEvents.length > 0 && (
          <div style={{ padding: '0 20px 12px' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '12px 14px', borderRadius: '12px',
              background: `${t.accent}12`, border: `1px solid ${t.accent}30`,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>
              <span style={{ fontSize: '14px' }}>🗓️</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: t.accent }}>
                View All Upcoming Shows ({entityEvents.length})
              </span>
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {entityEvents.map((ev, i) => (
            <div key={ev.id || i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 0',
              borderTop: i > 0 ? `1px solid ${t.border}` : 'none',
            }}>
              <div style={{
                background: t.accent, color: 'white', fontSize: '10px', fontWeight: 800,
                padding: '4px 8px', borderRadius: '6px', flexShrink: 0,
                textAlign: 'center', minWidth: '52px',
              }}>
                {ev.start_time || '—'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: t.text }}>{isVenue ? (ev.name || ev.artist_name) : (ev.venue || ev.venue_name)}</div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>
                  {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function HomePage() {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);
  const [toastVariant, setToastVariant] = useState(null);
  const [toastAction, setToastAction] = useState(null);           // callback for upsell toast tap
  const [toastActionLabel, setToastActionLabel] = useState(null); // label for upsell action button
  const [followExpandedCardId, setFollowExpandedCardId] = useState(null); // ID of the card whose inline follow upsell is open

  // ── Theme ────────────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('mlj_dark_mode');
    return stored === null ? true : stored === 'true'; // dark by default
  });

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('mlj_dark_mode', String(next));
      return next;
    });
  }, []);

  const t = darkMode ? DARK : LIGHT;

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('home');
  const [mapOpen,        setMapOpen]        = useState(false);
  const [dateKey,        setDateKey]        = useState('all');
  const [pickedDate,     setPickedDate]     = useState('');        // YYYY-MM-DD for 'pick' dateKey
  const [searchQuery,    setSearchQuery]    = useState('');
  const [activeVenues,   setActiveVenues]   = useState([]);    // multi-select venue filter
  const [milesRadius,    setMilesRadius]    = useState(null);  // null = any distance
  const [showSubmit,     setShowSubmit]     = useState(false);
  // reportEvent state removed — flagging now handled inline in EventCardV2
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeFilterCard, setActiveFilterCard] = useState(null); // 'distance' | 'when' | 'artist' | 'venue'
  const [venueSearch, setVenueSearch] = useState('');
  const [locationOrigin, setLocationOrigin] = useState('');       // zip or city text
  const [locationLabel, setLocationLabel] = useState('Current Location');  // display label
  const [locationCoords, setLocationCoords] = useState(null);     // { lat, lng } from geolocation or geocode
  const [geolocating, setGeolocating] = useState(false);
  const [artistSearch, setArtistSearch] = useState('');            // artist filter text
  const [activeShortcut, setActiveShortcut] = useState(null);     // shortcut pill key
  const [dbPills, setDbPills] = useState([]);                     // dynamic pills from Supabase
  // ── Auth state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);                          // Supabase user object
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTrigger, setAuthTrigger] = useState(null);            // 'save' | 'submit' | 'profile' | null
  // guestBannerDismissed removed — hard gate handles auth, no banner needed
  const [showWelcome, setShowWelcome] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);  // autocomplete dropdown
  const [locationFocused, setLocationFocused] = useState(false);       // show dropdown when focused
  const locationDebounceRef = useRef(null);

  // ── GPS helper: request location & reverse-geocode ──────────────────────────
  const triggerGPS = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10`)
          .then(r => r.json())
          .then(data => {
            const town = data.address?.town || data.address?.city || data.address?.village || data.address?.hamlet || 'Current Location';
            setLocationLabel(town);
            setLocationOrigin(town);
            setGeolocating(false);
          })
          .catch(() => { setLocationLabel('Current Location'); setLocationOrigin(''); setGeolocating(false); });
      },
      () => {
        setLocationLabel('');
        setLocationCoords(null);
        setGeolocating(false);
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  // ── Geolocation: auto-detect user's location on mount ─────────────────────
  useEffect(() => { triggerGPS(); }, [triggerGPS]);

  // Geocode a zip/city string to coordinates
  const geocodeLocation = useCallback(async (query) => {
    if (!query.trim()) {
      triggerGPS();
      return;
    }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', NJ')}&format=json&limit=1`);
      const results = await res.json();
      if (results.length > 0) {
        setLocationCoords({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
        const name = results[0].display_name.split(',')[0];
        setLocationLabel(name);
      }
    } catch {}
  }, [triggerGPS]);

  // Autocomplete: fetch location suggestions from Nominatim (debounced)
  const fetchLocationSuggestions = useCallback((query) => {
    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
    if (!query.trim() || query.trim().length < 2) { setLocationSuggestions([]); return; }
    locationDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', NJ')}&format=json&limit=5&addressdetails=1`
        );
        const results = await res.json();
        setLocationSuggestions(results.map(r => ({
          name: [r.address?.town || r.address?.city || r.address?.village || r.address?.hamlet || r.display_name.split(',')[0], r.address?.state || 'NJ'].filter(Boolean).join(', '),
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          full: r.display_name,
        })));
      } catch { setLocationSuggestions([]); }
    }, 300);
  }, []);

  // Select a suggestion from the autocomplete dropdown
  const selectLocationSuggestion = useCallback((suggestion) => {
    setLocationCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setLocationLabel(suggestion.name.split(',')[0]);
    setLocationOrigin(suggestion.name.split(',')[0]);
    setLocationSuggestions([]);
    setLocationFocused(false);
  }, []);

  // ── Bottom nav hide-on-scroll ───────────────────────────────────────────────
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);
  const datePickRef = useRef(null);
  const savedDatePickRef = useRef(null);
  const datePickOpenVal = useRef('');       // value when picker opened — guards iOS auto-fire
  const savedDatePickOpenVal = useRef('');
  const searchInputRef = useRef(null);
  const pendingSearchFocus = useRef(false);    // fallback for tab-switch focus
  const [searchFocused, setSearchFocused] = useState(false);  // visual threading
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAutoComplete, setShowAutoComplete] = useState(false);

  useEffect(() => {
    const threshold = 10; // minimum scroll delta to trigger
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY - lastScrollY.current > threshold) {
        // Scrolling down → hide
        setNavHidden(true);
      } else if (lastScrollY.current - currentY > threshold) {
        // Scrolling up → show
        setNavHidden(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Debounce searchQuery → debouncedSearch (300ms) ─────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Autocomplete suggestions from in-memory events (debounced) ─────────────
  const autoCompleteSuggestions = useMemo(() => {
    const q = (debouncedSearch ?? '').trim().toLowerCase();
    if (!q || q.length < 2 || !events.length) return [];

    const artistSet = new Map();   // normalized → display name
    const venueSet = new Map();    // normalized → display name

    // Words/phrases that indicate an event title, not an artist name
    const EVENT_TITLE_RE = /\b(presents?|featuring|feat\.|fest(ival)?|parade|rodeo|celebration|fundraiser|benefit|memorial|comedy show|bingo|trivia|karaoke|open mic|recreation|block party|car show|craft fair|flea market|fireworks|5k|run walk|jams presents)\b/i;

    for (const e of events) {
      // Artists: use joined artists table data — skip event titles masquerading as artists
      // Filters: must have enrichment, must be ≤50 chars, must not contain event-title keywords
      const artistName = (e.artists?.name ?? '').trim();
      if (artistName && artistName.length <= 50 && !EVENT_TITLE_RE.test(artistName)) {
        const key = artistName.toLowerCase();
        if (key.includes(q) && !artistSet.has(key)) artistSet.set(key, artistName);
      }
      // Venues: from joined venue data
      const venue = (e.venue ?? '').trim();
      if (venue) {
        const key = venue.toLowerCase();
        if (key.includes(q) && !venueSet.has(key)) venueSet.set(key, venue);
      }
    }

    const results = [];
    // Venues first (fewer, more precise), then artists
    for (const [, display] of venueSet) {
      if (results.length >= 6) break;
      results.push({ type: 'venue', label: display });
    }
    for (const [, display] of artistSet) {
      if (results.length >= 6) break;
      results.push({ type: 'artist', label: display });
    }
    return results;
  }, [debouncedSearch, events]);

  // (Auto-focus is now triggered synchronously in the omnibar onClick handler)

  // ── Notifications preference ─────────────────────────────────────────────────
  const [notifEnabled, setNotifEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('mlj_notif_enabled') === 'true';
  });

  const toggleNotifications = useCallback(async () => {
    if (!notifEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        localStorage.setItem('mlj_notif_enabled', 'true');
        setNotifEnabled(true);
        setToast('🔔 Notifications on — you\'ll be reminded 1 hour before saved events.');
      } else {
        setToast('Notifications blocked. Please enable them in your browser settings.');
      }
    } else {
      localStorage.setItem('mlj_notif_enabled', 'false');
      setNotifEnabled(false);
      setToast('🔕 Notifications turned off.');
    }
  }, [notifEnabled]);

  // ── Auth helper: open modal with trigger context ────────────────────────────
  const openAuth = useCallback((trigger = null) => {
    setAuthTrigger(trigger);
    setShowAuthModal(true);
  }, []);

  // ── Sign out helper ────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsLoggedIn(false);
    setToast('Signed out');
  }, []);

  // ── Saved Events (Supabase — auth required) ─────────────────────────────────
  const [favorites, setFavorites] = useState(new Set());

  // Fetch saved event IDs when user logs in
  useEffect(() => {
    if (!isLoggedIn || !user) { setFavorites(new Set()); return; }
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/saved-events', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const ids = await res.json();
          setFavorites(new Set(ids));
        }
      } catch {}
    })();
  }, [isLoggedIn, user]);

  // Refs for the follow upsell — lets toggleFavorite call follow logic defined later without TDZ issues
  const followingRef = useRef([]);
  const followEntityRef = useRef(null);

  // Save an event to Supabase (extracted so the Follow Action Sheet can call it)
  const saveEventToDb = useCallback(async (id) => {
    setFavorites(prev => { const next = new Set(prev); next.add(id); return next; });
    const event = events.find(e => e.id === id);
    if (event && notifEnabled) scheduleReminder(event);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch('/api/saved-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ event_id: id }),
      });
    } catch {}
  }, [events, notifEnabled]);

  // Unsave an event
  const unsaveEventFromDb = useCallback(async (id) => {
    setFavorites(prev => { const next = new Set(prev); next.delete(id); return next; });
    cancelReminder(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch('/api/saved-events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ event_id: id }),
      });
    } catch {}
  }, []);

  const toggleFavorite = useCallback(async (id) => {
    if (!id) return;
    // Hard gate: require auth
    if (!isLoggedIn) {
      openAuth('save');
      return;
    }
    const isSaved = favorites.has(id);

    if (isSaved) {
      // Already saved — unsave immediately, collapse any expansion
      unsaveEventFromDb(id);
      if (followExpandedCardId === id) setFollowExpandedCardId(null);
      return;
    }

    // Not saved yet — save immediately
    saveEventToDb(id);

    // If the event has an artist, expand inline follow upsell (auto-collapses any other)
    const event = events.find(e => e.id === id);
    if (event?.artist_name) {
      setFollowExpandedCardId(id);
    } else {
      // No artist — just show a brief toast
      setFollowExpandedCardId(null);
      setToastVariant('success');
      setToast('Event saved to My Jam');
    }
  }, [favorites, isLoggedIn, events, openAuth, unsaveEventFromDb, saveEventToDb, followExpandedCardId]);

  // ── Saved tab segment toggle (persisted per-session) ──────────────────────
  const [savedSegment, setSavedSegment] = useState(() => {
    if (typeof window === 'undefined') return 'events';
    return sessionStorage.getItem('mlj_saved_segment') || 'events';
  });

  const handleSetSavedSegment = useCallback((seg) => {
    setSavedSegment(seg);
    try { sessionStorage.setItem('mlj_saved_segment', seg); } catch {}
  }, []);

  // ── Following state (Supabase — auth required) ─────────────────────────────
  const [following, setFollowing] = useState([]);
  // Sync followingRef (declared before toggleFavorite) so it always has current state
  useEffect(() => { followingRef.current = following; }, [following]);

  // Fetch follows from API when user logs in
  useEffect(() => {
    if (!isLoggedIn || !user) { setFollowing([]); return; }
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/follows', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setFollowing(data);
        }
      } catch {}
    })();
  }, [isLoggedIn, user]);

  const followEntity = useCallback(async (entityType, entityName) => {
    // Hard gate: require auth
    if (!isLoggedIn) {
      openAuth('save');
      return;
    }
    const newFollow = {
      entity_type: entityType,
      entity_name: entityName,
      receives_notifications: true,
      next_gig: null,
      created_at: new Date().toISOString(),
    };
    // Optimistic update
    setFollowing(prev => {
      const exists = prev.some(f => f.entity_type === entityType && f.entity_name === entityName);
      if (exists) return prev;
      return [newFollow, ...prev];
    });
    // Sync to API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch('/api/follows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ artist_name: entityName }),
      });
    } catch {}
  }, [isLoggedIn, openAuth]);

  // Sync ref so toggleFavorite's toast action can call followEntity without TDZ
  useEffect(() => { followEntityRef.current = followEntity; }, [followEntity]);

  // ── Inline follow upsell callback (handled in EventCardV2 via onFollowArtist) ──

  const unfollowEntity = useCallback(async (entityType, entityName) => {
    // Optimistic removal
    setFollowing(prev => prev.filter(f => !(f.entity_type === entityType && f.entity_name === entityName)));
    // Sync to API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch('/api/follows', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ artist_name: entityName }),
      });
    } catch {}
  }, []);

  const toggleFollowNotif = useCallback(async (entityType, entityName) => {
    setFollowing(prev => prev.map(f => {
      if (f.entity_type === entityType && f.entity_name === entityName) {
        return { ...f, receives_notifications: !f.receives_notifications };
      }
      return f;
    }));
    // Sync to API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const target = following.find(f => f.entity_type === entityType && f.entity_name === entityName);
      await fetch('/api/follows', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ artist_name: entityName, receives_notifications: !target?.receives_notifications }),
      });
    } catch {}
  }, [following]);

  const isFollowing = useCallback((entityType, entityName) => {
    return following.some(f => f.entity_type === entityType && f.entity_name === entityName);
  }, [following]);

  // ── Bottom sheet state ────────────────────────────────────────────────────
  const [bottomSheet, setBottomSheet] = useState(null); // { type: 'venue'|'artist', name, entityId? }
  const [artistProfile, setArtistProfile] = useState(null); // artist name string or null

  // ── Fetch from Supabase ──────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const todayLocal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

      // Supabase PostgREST caps at 1000 rows per request — paginate to get all
      let allData = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from('events')
          .select('*, venues(name, address, color, photo_url, latitude, longitude, venue_type, tags), artists(name, bio, genres, vibes, is_tribute, image_url, instagram_url)')
          .gte('event_date', todayLocal)
          .eq('status', 'published')
          .order('event_date', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allData = allData.concat(page || []);
        if (!page || page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      const data = allData;

      const mapped = (data || []).map(e => {
        let extractedStartTime = e.start_time || (() => {
          if (e.event_date && e.event_date.includes('T')) {
            const d = new Date(e.event_date);
            // Use Eastern time, not UTC, so times display correctly
            const parts = d.toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: false,
              timeZone: 'America/New_York',
            }).split(':');
            const h = String(parseInt(parts[0])).padStart(2, '0');
            const m = parts[1];
            return `${h}:${m}`;
          }
          return null;
        })();

        // If time is midnight (00:00), try to extract from the event title
        // e.g. "Every Tuesday 8pm - Close" → "20:00"
        if (extractedStartTime === '00:00' || extractedStartTime === '24:00') {
          const title = e.artist_name || e.name || '';
          const tm = title.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
          if (tm) {
            let hr = parseInt(tm[1]);
            const mn = tm[2] ? parseInt(tm[2]) : 0;
            const per = tm[3].toLowerCase();
            if (per === 'pm' && hr !== 12) hr += 12;
            if (per === 'am' && hr === 12) hr = 0;
            extractedStartTime = `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
          }
        }

        return {
          ...e,
          name:       decodeEntities(e.event_title || e.artist_name  || e.name  || ''),
          venue:      e.venues?.name || e.venue_name || e.venue || '',
          date: (() => {
            const raw = e.event_date || '';
            if (!raw) return '';
            if (raw.includes('T')) {
              const d = new Date(raw);
              return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            }
            return raw.substring(0, 10);
          })(),
          start_time:    extractedStartTime,
          // Prefer joined artist bio over legacy event-level artist_bio
          description:   e.artists?.bio || e.artist_bio || e.description || '',
          // Event-level genre/vibe override artist-level (admin can set per-gig overrides)
          artist_genres: e.genre ? [e.genre] : (e.artists?.genres || []),
          artist_vibes:  e.vibe ? [e.vibe] : (e.artists?.vibes || []),
          is_tribute:    e.artists?.is_tribute || false,
          artist_instagram: e.artists?.instagram_url || null,
          artist_image:  e.artists?.image_url || null,
          venue_type:    e.venues?.venue_type || null,
          venue_tags:    e.venues?.tags || [],
          venue_name:    e.venues?.name    || e.venue_name    || '',
          venue_address: e.venues?.address || '',
          venue_color:   e.venues?.color   || getVenueColor(e.venues?.name || e.venue_name),
          venue_photo:   e.venues?.photo_url || null,
          venue_lat:     e.venues?.latitude  || null,
          venue_lng:     e.venues?.longitude || null,
        };
      });

      setEvents(mapped);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
    setLoading(false);
  }, []);

  const [spotlightIds, setSpotlightIds] = useState([]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { rehydrateReminders(); }, []);

  // ── Fetch dynamic shortcut pills from Supabase ────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from('shortcut_pills')
          .select('*')
          .eq('active', true)
          .order('sort_order', { ascending: true });
        // Filter seasonal pills: show only if today is within seasonal window (or no window set)
        const filtered = (data || []).filter(p => {
          if (p.seasonal_start && today < p.seasonal_start) return false;
          if (p.seasonal_end && today > p.seasonal_end) return false;
          return true;
        });
        setDbPills(filtered);
      } catch (err) {
        console.error('Error fetching pills:', err);
      }
    })();
  }, []);

  // ── Supabase Auth listener ─────────────────────────────────────────────────
  useEffect(() => {
    // Check current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoggedIn(!!session?.user);
    });
    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setIsLoggedIn(!!u);
      if (u && showAuthModal) {
        // User just signed in — close modal
        setShowAuthModal(false);
        setAuthTrigger(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Welcome modal for first-time visitors ──────────────────────────────────
  useEffect(() => {
    try {
      if (!localStorage.getItem('mlj_hasSeenWelcomeModal')) {
        // Small delay so the app renders first, feels intentional
        const timer = setTimeout(() => setShowWelcome(true), 800);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, []);

  useEffect(() => { setDateKey('all'); setPickedDate(''); }, [activeTab]);

  // ── Unified search opener — single handler for both header pill & bottom nav ──
  const openSearch = useCallback(() => {
    if (activeTab === 'home') {
      // Already on home — open panel and focus synchronously (iOS user-gesture)
      setFiltersExpanded(true);
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
      // Belt-and-suspenders: retry after panel animation for browsers that block focus on hidden elements
      setTimeout(() => { searchInputRef.current?.focus(); }, 80);
    } else {
      // Switching tabs — input not in DOM yet, set flag for effect below
      setActiveTab('home');
      setFiltersExpanded(true);
      pendingSearchFocus.current = true;
    }
  }, [activeTab]);

  // Pick up pending search focus after tab switch renders the input
  useEffect(() => {
    if (activeTab === 'home' && filtersExpanded && pendingSearchFocus.current) {
      pendingSearchFocus.current = false;
      // Use rAF to fire after React paints the input into the DOM
      requestAnimationFrame(() => { searchInputRef.current?.focus(); });
    }
  }, [activeTab, filtersExpanded]);

  // Fetch spotlight pins for today
  useEffect(() => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    fetch(`/api/spotlight?date=${today}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSpotlightIds(data.map(d => d.event_id));
      })
      .catch(() => setSpotlightIds([]));
  }, []);

  // ── Date boundaries (local time) ─────────────────────────────────────────────
  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const todayStr    = localDateStr(new Date());
  const tomorrowStr = localDateStr(new Date(new Date().setDate(new Date().getDate() + 1)));
  const fridayStr   = (() => {
    const d = new Date(); const day = d.getDay();
    if (day === 5) return localDateStr(d);
    if (day === 6) { d.setDate(d.getDate() - 1); return localDateStr(d); }
    if (day === 0) { d.setDate(d.getDate() - 2); return localDateStr(d); }
    d.setDate(d.getDate() + (5 - day)); return localDateStr(d);
  })();
  const sundayStr = (() => {
    const d = new Date(fridayStr + 'T00:00:00'); d.setDate(d.getDate() + 2);
    return localDateStr(d);
  })();

  // ── Filtered events ──────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let list = [...events];

    switch (dateKey) {
      case 'today':   list = list.filter(e => e.date === todayStr); break;
      case 'tomorrow':list = list.filter(e => e.date === tomorrowStr); break;
      case 'weekend': {
        const weekendStart = todayStr > fridayStr ? todayStr : fridayStr;
        list = list.filter(e => e.date >= weekendStart && e.date <= sundayStr);
        break;
      }
      case 'pick':
        if (pickedDate) { list = list.filter(e => e.date === pickedDate); }
        else { list = list.filter(e => e.date >= todayStr); }
        break;
      default:
        list = list.filter(e => e.date >= todayStr);
        break;
    }

    if (activeVenues.length > 0) list = list.filter(e => activeVenues.includes(e.venue));

    // Artist filter
    if (artistSearch.trim()) {
      const aq = normalizeVenue(artistSearch);
      list = list.filter(e => normalizeVenue(e.name).includes(aq));
    }

    if (debouncedSearch.trim()) {
      const q = normalizeVenue(debouncedSearch);
      list = list.filter(e =>
        normalizeVenue(e.name).includes(q) ||
        normalizeVenue(e.venue).includes(q) ||
        normalizeVenue(e.genre ?? '').includes(q)
      );
    }

    // Distance filter: Haversine from user location to venue coordinates
    if (milesRadius !== null && locationCoords) {
      list = list.filter(e => {
        if (!e.venue_lat || !e.venue_lng) return false; // exclude venues without coords
        const dist = haversineDistance(
          locationCoords.lat, locationCoords.lng,
          e.venue_lat, e.venue_lng
        );
        return dist <= milesRadius;
      });
    }

    // Shortcut pill filter
    if (activeShortcut) {
      const pill = dbPills.find(p => p.id === activeShortcut);
      if (pill) {
        const cfg = pill.filter_config || {};
        switch (pill.filter_type) {
          case 'trending': {
            // Show events from the top 25% busiest venues (by upcoming event count)
            const venueCounts = {};
            list.forEach(e => { venueCounts[e.venue] = (venueCounts[e.venue] || 0) + 1; });
            const counts = Object.values(venueCounts).sort((a, b) => b - a);
            // Threshold = count at the 25th percentile, minimum 8
            const threshold = Math.max(counts[Math.floor(counts.length * 0.25)] || 1, 8);
            const hotVenues = new Set(Object.entries(venueCounts).filter(([, c]) => c >= threshold).map(([v]) => v));
            list = list.filter(e => hotVenues.has(e.venue));
            break;
          }
          case 'venue_type': {
            const types = (cfg.venue_types || []).map(t => t.toLowerCase());
            list = list.filter(e => e.venue_type && types.includes(e.venue_type.toLowerCase()));
            break;
          }
          case 'genre': {
            const genres = (cfg.genres || []).map(g => g.toLowerCase());
            const terms = (cfg.terms || []).map(s => s.toLowerCase());
            list = list.filter(e => {
              const eg = (e.artist_genres || []).map(g => g.toLowerCase());
              const an = (e.name || '').toLowerCase();
              const g = (e.genre || '').toLowerCase();
              if (genres.some(g2 => eg.includes(g2))) return true;
              if (terms.some(s => an.includes(s) || g.includes(s))) return true;
              return false;
            });
            break;
          }
          case 'is_tribute': {
            list = list.filter(e => e.is_tribute === true);
            break;
          }
          case 'search': {
            const terms = (cfg.terms || []).map(s => s.toLowerCase());
            list = list.filter(e => {
              const an = (e.name || '').toLowerCase();
              const g = (e.genre || '').toLowerCase();
              const desc = (e.description || '').toLowerCase();
              return terms.some(s => an.includes(s) || g.includes(s) || desc.includes(s));
            });
            break;
          }
          case 'time': {
            if (cfg.before_hour) {
              list = list.filter(e => {
                if (!e.start_time) return false;
                const hr = parseInt(e.start_time.split(':')[0], 10);
                return hr < cfg.before_hour;
              });
            }
            break;
          }
          default:
            break;
        }
      }
    }

    // Sort by date, then by time — push null/midnight (no real time) to bottom of each day
    const hasRealTime = (t) => t && t !== '00:00' && t !== '24:00';
    list.sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      const aReal = hasRealTime(a.start_time);
      const bReal = hasRealTime(b.start_time);
      if (aReal && !bReal) return -1;
      if (!aReal && bReal) return 1;
      return (a.start_time ?? '').localeCompare(b.start_time ?? '');
    });

    return list;
  }, [events, dateKey, pickedDate, activeVenues, artistSearch, debouncedSearch, milesRadius, locationCoords, activeShortcut, dbPills, todayStr, tomorrowStr, fridayStr, sundayStr]);

  const groupedEvents = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

  const heroEvents = useMemo(() => {
    // Priority 1: Manual spotlight pins from admin
    if (spotlightIds.length > 0) {
      const pinned = spotlightIds
        .map(id => events.find(e => e.id === id))
        .filter(Boolean);
      if (pinned.length > 0) return pinned;
    }

    // Priority 2: Algorithmic fallback — today's events sorted by time
    const todayEvents = events
      .filter(e => e.date === todayStr)
      .sort((a, b) => {
        const aR = a.start_time && a.start_time !== '00:00';
        const bR = b.start_time && b.start_time !== '00:00';
        if (aR && !bR) return -1;
        if (!aR && bR) return 1;
        return (a.start_time ?? '').localeCompare(b.start_time ?? '');
      });
    if (todayEvents.length > 0) return todayEvents;

    // Priority 3: Next upcoming events
    return events
      .filter(e => e.date > todayStr)
      .sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        if (dc !== 0) return dc;
        const aR = a.start_time && a.start_time !== '00:00';
        const bR = b.start_time && b.start_time !== '00:00';
        if (aR && !bR) return -1;
        if (!aR && bR) return 1;
        return (a.start_time ?? '').localeCompare(b.start_time ?? '');
      })
      .slice(0, 6);
  }, [events, todayStr, spotlightIds]);

  const heroIsToday = heroEvents.length > 0 && heroEvents[0]?.date === todayStr;

  // Spotlight carousel events — manually flagged by admin
  const spotlightCarouselEvents = useMemo(() => {
    return events.filter(e => e.is_spotlight === true);
  }, [events]);

  // Venue list with event counts (for FilterBar)
  const venueListWithCounts = useMemo(() => {
    const map = {};
    events.forEach(e => {
      if (e.venue) map[e.venue] = (map[e.venue] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  function normalizeVenue(s) {
    return (s ?? '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const hasActiveFilters = dateKey !== 'all' || milesRadius !== null || searchQuery.trim() !== '' || activeShortcut !== null;
  const activeFilterCount = [dateKey !== 'all', milesRadius !== null, searchQuery.trim() !== '', activeShortcut !== null].filter(Boolean).length;
  const clearAllFilters = useCallback(() => {
    setDateKey('all');
    setPickedDate('');
    setActiveVenues([]);
    setMilesRadius(null);
    setArtistSearch('');
    setSearchQuery('');
    setFiltersExpanded(false);
    setActiveFilterCard(null);
    setVenueSearch('');
    setActiveShortcut(null);
  }, []);

  // Filter panel labels
  const whenLabel = dateKey === 'pick' && pickedDate
    ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : DATE_OPTIONS.find(o => o.key === dateKey)?.label || 'Any time';
  const venueLabel = activeVenues.length === 0 ? 'Any Venue' : activeVenues.length === 1 ? activeVenues[0] : `${activeVenues.length} venues`;
  const distanceLabel = milesRadius === null ? 'Any distance' : `${milesRadius} mi`;
  const artistLabel = artistSearch.trim() ? artistSearch.trim() : 'Any Artist';


  // Filtered venues for search inside panel
  const filteredPanelVenues = useMemo(() => {
    if (!venueSearch.trim()) return venueListWithCounts;
    const q = venueSearch.toLowerCase();
    return venueListWithCounts.filter(v => v.name.toLowerCase().includes(q));
  }, [venueListWithCounts, venueSearch]);

  // ── Shared styles ────────────────────────────────────────────────────────────
  const dateSeparatorStyle = {
    fontSize: '13px', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '1px', color: darkMode ? '#9898B8' : '#6B7280',
  };

  return (
    <>
      <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: t.bg, maxWidth: '480px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* ── Top Nav ────────────────────────────────────────────────────── */}
        <header onClick={() => { if (filtersExpanded) { setFiltersExpanded(false); setActiveFilterCard(null); } }} style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: darkMode ? '#1E1E2C' : '#FFFFFF',
          borderBottom: `1px solid ${t.border}`,
          boxShadow: darkMode ? '0 2px 16px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.08)',
          padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px 16px',
          display: 'flex', alignItems: 'center', gap: '10px',
          minHeight: '60px',
          width: '100%', maxWidth: '100%', boxSizing: 'border-box',
        }}>
          {/* Logo — left */}
          <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ color: darkMode ? '#FFFFFF' : '#1F2937' }}>my</span>
              <span style={{ color: '#E8722A' }}>Local</span>
              <span style={{ color: '#3AADA0' }}>Jam</span>
            </span>
          </div>

          {/* Spacer + Omnibar — hidden on saved/profile tabs */}
          {activeTab !== 'saved' && activeTab !== 'profile' && <>
          <div style={{ width: '6px', flexShrink: 0 }} />

          {/* Omnibar pill — Fake search bar (button only, never a text input) */}
          <button onClick={(e) => {
            e.stopPropagation();
            if (filtersExpanded) {
              setFiltersExpanded(false);
              setActiveFilterCard(null);
            } else {
              openSearch();
            }
          }} style={{
            display: 'flex', alignItems: 'center', gap: '6px', flex: 1,
            padding: filtersExpanded ? '0 10px' : '7px 10px',
            background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.95)',
            border: `1px solid ${
              hasActiveFilters ? t.accent
              : (darkMode ? 'rgba(255, 255, 255, 0.25)' : '#D1D5DB')
            }`,
            borderRadius: '20px', cursor: 'pointer', position: 'relative',
            boxShadow: hasActiveFilters
                ? `0 0 6px ${t.accent}30, 0 0 12px ${t.accent}15`
                : (darkMode ? '0 1px 6px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.08)'),
            transition: 'all 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
            // Hide pill when panel is open — user only sees the modal's search input
            opacity: filtersExpanded ? 0 : 1,
            pointerEvents: filtersExpanded ? 'none' : 'auto',
            maxHeight: filtersExpanded ? '0px' : '40px',
            overflow: 'hidden',
          }}>
            {/* Search icon — crisp white for visibility */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={darkMode ? '#F0F0F5' : '#374151'} />
            </svg>
            {searchQuery.trim() ? (
              <span style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', fontWeight: 600,
                color: t.text,
                fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{searchQuery.trim()}</span>
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); setSearchQuery(''); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                    background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.text} /></svg>
                </span>
              </span>
            ) : (
              <span style={{
                fontSize: '12px', fontWeight: 500,
                color: darkMode ? 'rgba(255, 255, 255, 0.7)' : '#4B5563',
                fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                transition: 'color 0.2s ease',
              }}>
                Search / Filters
              </span>
            )}
            {/* Active filter pills inline — category-colored */}
            {hasActiveFilters && (
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <span style={{ color: t.textMuted, fontSize: '8px', opacity: 0.5, flexShrink: 0 }}>|</span>
                {dateKey !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: '#E8722A', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" fill="#E8722A" /></svg>
                    {dateKey === 'pick' && pickedDate
                      ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : ({ today: 'Today', tomorrow: 'Tmrw', weekend: 'Wknd' }[dateKey] || dateKey)}
                  </span>
                )}
                {milesRadius !== null && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: '#E8722A', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill="#E8722A" /></svg>
                    {milesRadius}mi
                  </span>
                )}
                {activeShortcut && (() => {
                  const pill = dbPills.find(p => p.id === activeShortcut);
                  if (!pill) return null;
                  const iconPath = MATERIAL_ICON_PATHS[pill.icon_name] || MATERIAL_ICON_PATHS.label;
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: '#E8722A', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d={iconPath} fill="#E8722A" /></svg>
                      {pill.label}
                    </span>
                  );
                })()}
              </div>
            )}
            {!hasActiveFilters && <div style={{ flex: 1 }} />}
            {/* Right: badge or tune icon */}
            {hasActiveFilters ? (<>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '2px',
                fontSize: '9px', fontWeight: 700, color: '#FFFFFF',
                background: t.accent, borderRadius: '8px',
                padding: '1px 5px', flexShrink: 0, lineHeight: '14px',
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill="#FFFFFF" /></svg>
                {activeFilterCount}
              </span>
              {/* Quick clear X — resets all filters without opening the panel */}
              <button
                onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, borderRadius: '50%',
                }}
                title="Clear all filters"
              >
                <svg width="12" height="12" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={darkMode ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} /></svg>
              </button>
            </>) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill={darkMode ? 'rgba(255,255,255,0.5)' : '#6B7280'} />
              </svg>
            )}
          </button>
          </>}

          {/* Add to the Jar FAB — hidden on saved/profile tabs */}
          {activeTab !== 'saved' && activeTab !== 'profile' && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSubmit(true); }}
              title="Add to the Jar"
              style={{
                width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                background: t.accent,
                cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="white" /></svg>
            </button>
          )}
        </header>

        {/* ── Filter Panel (expands from header) ─────────────────────── */}
        <div style={{
          maxHeight: filtersExpanded ? '600px' : '0px',
          opacity: filtersExpanded ? 1 : 0,
          overflow: filtersExpanded ? 'visible' : 'hidden',
          transition: filtersExpanded
            ? 'max-height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease'
            : 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
          background: darkMode ? '#1A1A28' : '#F2F0ED',
          borderBottom: filtersExpanded ? `1px solid ${t.border}` : 'none',
          position: 'relative', zIndex: 99,
        }}>
          {activeTab === 'home' && (
            <div style={{ padding: '6px 12px 8px' }}>
              <div style={{
                borderRadius: '12px', overflow: 'hidden',
                boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.08)',
                background: darkMode ? '#20202E' : '#F5F3F0',
              }}>
                {/* Search input + Clear All row */}
                <div style={{
                  padding: '10px 14px',
                  borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  background: darkMode ? '#262636' : '#FFFFFF',
                  borderRadius: '12px 12px 0 0',
                }}>
                  {/* Top row: Clear All (left) + Close X (right) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <button onClick={clearAllFilters} style={{
                      background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0',
                      fontSize: '12px', fontWeight: 600,
                      color: darkMode ? '#C0C0D0' : '#6B7280',
                      fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.3px',
                      textDecoration: 'underline', textUnderlineOffset: '2px',
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      opacity: hasActiveFilters ? 1 : 0.5,
                    }}>
                      {/* Material: restart_alt */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor" />
                      </svg>
                      Clear All
                    </button>
                    <button onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {/* Material: close */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.textMuted} /></svg>
                    </button>
                  </div>
                  {/* Search input row + autocomplete wrapper */}
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 12px', borderRadius: '10px',
                      border: `1px solid ${searchFocused ? (darkMode ? '#E8722A80' : '#E8722A') : (darkMode ? '#2E2E40' : '#DDD')}`,
                      background: darkMode ? '#22222E' : t.inputBg,
                      transition: 'border-color 0.2s',
                    }}>
                      {/* Material: search */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={darkMode ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} />
                      </svg>
                      <input
                        ref={searchInputRef}
                        type="text"
                        enterKeyHint="search"
                        placeholder="Search artists, venues, events..."
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setShowAutoComplete(true); }}
                        onFocus={() => { setSearchFocused(true); setActiveFilterCard(null); if (searchQuery.trim().length >= 2) setShowAutoComplete(true); }}
                        onBlur={() => { setSearchFocused(false); setTimeout(() => setShowAutoComplete(false), 150); }}
                        onKeyDown={e => { if (e.key === 'Enter') { setShowAutoComplete(false); e.target.blur(); setFiltersExpanded(false); setActiveFilterCard(null); } }}
                        style={{
                          flex: 1, border: 'none', background: 'none', outline: 'none',
                          fontSize: '16px', color: t.text, fontFamily: "'DM Sans', sans-serif",
                        }}
                      />
                      {searchQuery && (
                        <button onClick={() => { setSearchQuery(''); setShowAutoComplete(false); }} style={{
                          background: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                          border: 'none', cursor: 'pointer', padding: 0,
                          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {/* Material: close */}
                          <svg width="12" height="12" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.text} /></svg>
                        </button>
                      )}
                    </div>

                    {/* ── Autocomplete dropdown ────────── */}
                    {showAutoComplete && autoCompleteSuggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        marginTop: '4px', borderRadius: '10px', zIndex: 100,
                        background: darkMode ? '#1E1E2E' : '#FFFFFF',
                        border: `1px solid ${darkMode ? '#3A3A4A' : '#DDD'}`,
                        boxShadow: darkMode
                          ? '0 8px 24px rgba(0,0,0,0.5)'
                          : '0 8px 24px rgba(0,0,0,0.12)',
                        overflow: 'hidden',
                      }}>
                        {autoCompleteSuggestions.map((s, i) => (
                          <button
                            key={`${s.type}-${s.label}`}
                            onMouseDown={e => {
                              e.preventDefault(); // prevent blur before click fires
                              setSearchQuery(s.label);
                              setDebouncedSearch(s.label);
                              setShowAutoComplete(false);
                              setFiltersExpanded(false);
                              setActiveFilterCard(null);
                              searchInputRef.current?.blur();
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              width: '100%', padding: '11px 14px', border: 'none',
                              background: 'transparent', cursor: 'pointer', textAlign: 'left',
                              borderBottom: i < autoCompleteSuggestions.length - 1
                                ? `1px solid ${darkMode ? '#2A2A3A' : '#F0F0F0'}` : 'none',
                              fontFamily: "'DM Sans', sans-serif",
                              transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = darkMode ? '#2A2A3A' : '#F5F5F5'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path
                                d={s.type === 'venue' ? MATERIAL_ICON_PATHS.location_on : MATERIAL_ICON_PATHS.music_note}
                                fill={s.type === 'venue' ? '#a78bfa' : '#E8722A'}
                              />
                            </svg>
                            <span style={{
                              fontSize: '14px', fontWeight: 500,
                              color: t.text, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{s.label}</span>
                            <span style={{
                              fontSize: '11px', color: t.textMuted, marginLeft: 'auto',
                              flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px',
                            }}>{s.type}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Shortcut Pills — horizontal scroll ────────── */}
                <div
                  className="shortcut-pills"
                  style={{
                    display: 'flex', overflowX: 'auto', gap: '8px',
                    padding: '8px 14px',
                    WebkitOverflowScrolling: 'touch',
                    borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                    background: darkMode ? '#262636' : '#FFFFFF',
                  }}
                >
                  {dbPills.map(pill => {
                    const isActive = activeShortcut === pill.id;
                    const iconPath = MATERIAL_ICON_PATHS[pill.icon_name] || MATERIAL_ICON_PATHS.label;
                    return (
                      <button
                        key={pill.id}
                        onClick={() => setActiveShortcut(isActive ? null : pill.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          padding: '7px 14px', borderRadius: '20px',
                          border: isActive ? '1.5px solid #E8722A' : `1px solid ${darkMode ? '#3A3A4A' : '#D1D5DB'}`,
                          background: isActive ? '#E8722A' : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'),
                          color: isActive ? '#FFFFFF' : (darkMode ? '#C0C0D0' : '#4B5563'),
                          fontSize: '12px', fontWeight: isActive ? 700 : 500,
                          fontFamily: "'DM Sans', sans-serif",
                          whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <path d={iconPath} fill="currentColor" />
                        </svg>
                        {pill.label}
                      </button>
                    );
                  })}
                </div>

                {/* 1. WHERE card — Blue accent (#E8722A) */}
                <div style={{
                  background: activeFilterCard === 'distance'
                    ? (darkMode ? '#2A1E14' : '#FFF8F3')
                    : (darkMode ? '#262636' : '#FFFFFF'),
                  border: activeFilterCard === 'distance'
                    ? `1.5px solid ${darkMode ? '#E8722A80' : '#E8722A'}`
                    : `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  borderRadius: activeFilterCard === 'distance' ? '10px' : '0',
                  margin: activeFilterCard === 'distance' ? '4px 6px' : '0',
                  transition: 'all 0.2s ease',
                  colorScheme: darkMode ? 'dark' : 'light',
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'distance' ? null : 'distance')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill={milesRadius !== null ? '#E8722A' : t.textMuted} /></svg>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: milesRadius !== null ? '#E8722A' : (darkMode ? '#9898B8' : '#6B7280'), lineHeight: 1, marginBottom: '2px' }}>Where</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: t.text, lineHeight: 1.2 }}>
                        {milesRadius !== null ? `Within ${milesRadius} miles` : 'Any distance'}
                      </div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 10 10" style={{ transform: activeFilterCard === 'distance' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={milesRadius !== null ? '#E8722A' : t.textMuted} strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'distance' && (
                    <div style={{ padding: '0 12px 10px', position: 'relative' }}>
                      {/* Location input with crosshairs GPS button */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px', borderRadius: '8px', marginBottom: '10px',
                        border: `1px solid ${locationFocused ? (darkMode ? '#E8722A80' : '#E8722A') : (darkMode ? '#2E2E40' : '#DDD')}`,
                        background: darkMode ? '#22222E' : t.inputBg,
                        transition: 'border-color 0.2s',
                        colorScheme: darkMode ? 'dark' : 'light',
                      }}>
                        {/* Crosshairs — tappable to re-trigger GPS */}
                        <button onClick={() => { triggerGPS(); setLocationSuggestions([]); }} title="Use current location" style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex',
                          borderRadius: '50%', transition: 'background 0.15s',
                        }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" fill={geolocating ? t.accent : '#E8722A'} /></svg>
                        </button>
                        <input
                          type="text"
                          placeholder={geolocating ? 'Locating...' : 'Search city, town, or zip...'}
                          value={locationOrigin}
                          onChange={e => { setLocationOrigin(e.target.value); fetchLocationSuggestions(e.target.value); }}
                          onFocus={() => setLocationFocused(true)}
                          onBlur={() => { setTimeout(() => { setLocationFocused(false); setLocationSuggestions([]); }, 200); }}
                          onKeyDown={e => { if (e.key === 'Enter' && locationOrigin.trim()) { geocodeLocation(locationOrigin.trim()); setLocationSuggestions([]); e.target.blur(); } }}
                          style={{
                            flex: 1, border: 'none', background: 'transparent', outline: 'none',
                            fontSize: '16px', color: t.text, fontFamily: "'DM Sans', sans-serif",
                            WebkitTextFillColor: t.text,
                            WebkitAppearance: 'none',
                            colorScheme: darkMode ? 'dark' : 'light',
                          }}
                        />
                        {locationOrigin && (
                          <button onClick={() => { setLocationOrigin(''); setLocationSuggestions([]); triggerGPS(); }} style={{
                            background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                            border: 'none', cursor: 'pointer',
                            width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={darkMode ? '#FFFFFF' : '#666'} strokeWidth="1" /></svg>
                          </button>
                        )}
                      </div>
                      {/* Autocomplete dropdown */}
                      {locationSuggestions.length > 0 && locationFocused && (
                        <div style={{
                          position: 'absolute', left: '12px', right: '12px', zIndex: 200,
                          background: darkMode ? '#2A2A3C' : '#FFFFFF',
                          border: `1px solid ${darkMode ? '#3A3A50' : '#DDD'}`,
                          borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                          overflow: 'hidden', marginTop: '-6px',
                        }}>
                          {locationSuggestions.map((s, i) => (
                            <button key={i} onMouseDown={() => selectLocationSuggestion(s)} style={{
                              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                              padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer',
                              borderBottom: i < locationSuggestions.length - 1 ? `1px solid ${darkMode ? '#3A3A50' : '#EEE'}` : 'none',
                              textAlign: 'left',
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill="#E8722A" /></svg>
                              <span style={{ fontSize: '14px', color: t.text, fontFamily: "'DM Sans', sans-serif" }}>{s.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Slider with bookend labels — disabled when no valid location */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 2px', marginTop: '24px', marginBottom: '16px', opacity: locationCoords ? 1 : 0.4, pointerEvents: locationCoords ? 'auto' : 'none' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#A0A0A0', minWidth: '24px', textAlign: 'left', fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>0 mi</span>
                        <input type="range" min="0" max="50" value={milesRadius ?? 0}
                          className="distance-slider"
                          disabled={!locationCoords}
                          onChange={e => { const v = parseInt(e.target.value); setMilesRadius(v === 0 ? null : v); }}
                          style={{
                            flex: 1, height: '6px',
                            background: `linear-gradient(to right, #E8722A ${((milesRadius ?? 0) / 50) * 100}%, ${darkMode ? '#3A3A4A' : '#DDD'} 0%)`,
                            borderRadius: '3px',
                          }}
                        />
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#A0A0A0', minWidth: '28px', textAlign: 'right', fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>50 mi</span>
                      </div>
                      {/* Current radius display */}
                      {milesRadius !== null && locationCoords && (
                        <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#E8722A', fontFamily: "'DM Sans', sans-serif" }}>
                          {milesRadius} miles from {locationLabel}
                        </div>
                      )}
                      {!locationCoords && !geolocating && (
                        <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '11px', fontWeight: 500, color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
                          Enter a location or tap the crosshairs to enable distance filtering
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. WHEN card — Green accent (#E8722A) */}
                <div style={{
                  background: activeFilterCard === 'when'
                    ? (darkMode ? '#2A1E14' : '#FFF8F3')
                    : (darkMode ? '#262636' : '#FFFFFF'),
                  border: activeFilterCard === 'when'
                    ? `1.5px solid ${darkMode ? '#E8722A80' : '#E8722A'}`
                    : `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  borderRadius: activeFilterCard === 'when' ? '10px' : '0',
                  margin: activeFilterCard === 'when' ? '4px 6px' : '0',
                  transition: 'all 0.2s ease',
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'when' ? null : 'when')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px',
                  }}>
                    {/* Material: calendar_month */}
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" fill={dateKey !== 'all' ? '#E8722A' : t.textMuted} /></svg>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: dateKey !== 'all' ? '#E8722A' : (darkMode ? '#9898B8' : '#6B7280'), lineHeight: 1, marginBottom: '2px' }}>When</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: t.text, lineHeight: 1.2 }}>{whenLabel}</div>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: activeFilterCard === 'when' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={dateKey !== 'all' ? '#E8722A' : t.textMuted} strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'when' && (
                    <div style={{ padding: '0 12px 8px 12px' }}>
                      {/* Row 1: Quick-select pills — forced single line */}
                      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '4px' }}>
                        {DATE_OPTIONS.filter(o => o.key !== 'pick').map(opt => (
                          <button key={opt.key} onClick={() => {
                            setDateKey(opt.key);
                            setPickedDate(''); setActiveFilterCard(null);
                          }} style={{
                            flex: 1, padding: '10px 6px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                            background: dateKey === opt.key ? '#E8722A' : (darkMode ? '#2A2A3C' : '#E8E6E2'),
                            color: dateKey === opt.key ? '#fff' : t.text,
                            fontSize: '13px', fontWeight: dateKey === opt.key ? 700 : 500,
                            fontFamily: "'DM Sans', sans-serif",
                            minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            whiteSpace: 'nowrap',
                          }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {/* Row 2: Full-width date picker — invisible input overlay */}
                      <div style={{ position: 'relative', marginTop: '8px' }}>
                        <div style={{
                          width: '100%', padding: '12px 16px', borderRadius: '12px',
                          background: dateKey === 'pick' ? '#E8722A' : (darkMode ? '#2A2A3C' : '#E8E6E2'),
                          color: dateKey === 'pick' ? '#fff' : t.text,
                          fontSize: '14px', fontWeight: dateKey === 'pick' ? 700 : 500,
                          fontFamily: "'DM Sans', sans-serif",
                          minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          pointerEvents: 'none',
                        }}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                            <rect x="1" y="2.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                            <path d="M1 6.5h14" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M4.5 1v3M11.5 1v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          {dateKey === 'pick' && pickedDate
                            ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'Pick a Specific Date'}
                        </div>
                        <input ref={datePickRef} type="date" value={todayStr} min={todayStr}
                          onClick={e => { try { e.target.showPicker(); } catch {} }}
                          onFocus={e => { datePickOpenVal.current = e.target.value; try { e.target.showPicker(); } catch {} }}
                          onChange={e => {
                            const v = e.target.value;
                            if (v && v !== datePickOpenVal.current) {
                              setPickedDate(v); setDateKey('pick'); setActiveFilterCard(null);
                              datePickOpenVal.current = v;
                            }
                          }}
                          onBlur={e => {
                            const v = e.target.value;
                            if (v && v !== datePickOpenVal.current) {
                              setPickedDate(v); setDateKey('pick'); setActiveFilterCard(null);
                              datePickOpenVal.current = v;
                            }
                          }}
                          style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            width: '100%', height: '100%',
                            opacity: 0, cursor: 'pointer', zIndex: 10,
                            WebkitAppearance: 'none',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Artist & Venue dropdowns removed — Omnibar search covers both */}

                {/* Action bar — Show events CTA */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '8px 12px', background: darkMode ? '#262636' : '#FFFFFF',
                  borderTop: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
                  borderRadius: '0 0 12px 12px',
                }}>
                  <button onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }} style={{
                    padding: '10px 24px', borderRadius: '10px', border: 'none',
                    background: t.accent, color: 'white', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                    width: '100%',
                  }}>
                    Show {filteredEvents.length} events
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scrim overlay when filter panel is open */}
        {filtersExpanded && (
          <div onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 98,
            background: 'rgba(0,0,0,0.3)',
          }} />
        )}

        {/* ── Hero (home tab only) — swipeable spotlight ────────────────── */}
        {activeTab === 'home' && (
          <HeroSection events={heroEvents} spotlightEvents={spotlightCarouselEvents} isToday={heroIsToday} />
        )}

        {/* FilterBar removed — filters now live in the omnibar panel */}


        {/* ── Saved view (Phase 2: Segmented — Saved Events | Following) ── */}
        {activeTab === 'saved' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg }}>
            {/* Segmented control — Brand Orange pill */}
            <div style={{
              display: 'flex', margin: '10px 16px 0', padding: '3px',
              background: darkMode ? '#1A1A24' : '#E5E7EB', borderRadius: '12px',
              border: `1px solid ${darkMode ? '#2A2A3A' : '#D1D5DB'}`,
            }}>
              {[
                { key: 'events', label: 'My Shows' },
                { key: 'following', label: 'My Artists' },
              ].map(seg => (
                <button key={seg.key} onClick={() => handleSetSavedSegment(seg.key)} style={{
                  flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: savedSegment === seg.key ? '#E8722A' : 'transparent',
                  color: savedSegment === seg.key ? '#FFFFFF' : t.textMuted,
                  fontSize: '13px', fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s ease',
                  boxShadow: savedSegment === seg.key ? '0 2px 8px rgba(232,114,42,0.3)' : 'none',
                  letterSpacing: '0.5px',
                }}>
                  {seg.label}
                </button>
              ))}
            </div>

            {/* Yellow guest banner removed — hard gate handles auth */}

            {/* View A: Saved Events */}
            {savedSegment === 'events' && (() => {
                  let savedEvents = events.filter(e => favorites.has(e.id));

                  // 6:00 AM rollover rule — keep event visible until 6 AM the morning after
                  // (Frontend-only filter; does NOT delete from user_saved_events table)
                  const now = new Date();
                  savedEvents = savedEvents.filter(e => {
                    if (!e.date) return true;
                    // Build a Date for 6:00 AM on the day AFTER the event
                    const eventDate = new Date(e.date.substring(0, 10) + 'T06:00:00');
                    eventDate.setDate(eventDate.getDate() + 1); // next morning 6 AM
                    return now < eventDate;
                  });

                  if (searchQuery.trim()) {
                    const q = normalizeVenue(searchQuery);
                    savedEvents = savedEvents.filter(e =>
                      normalizeVenue(e.name).includes(q) ||
                      normalizeVenue(e.venue).includes(q) ||
                      normalizeVenue(e.genre ?? '').includes(q)
                    );
                  }

                  savedEvents = savedEvents.sort((a, b) => {
                    const dc = a.date.localeCompare(b.date);
                    if (dc !== 0) return dc;
                    const aR = a.start_time && a.start_time !== '00:00';
                    const bR = b.start_time && b.start_time !== '00:00';
                    if (aR && !bR) return -1;
                    if (!aR && bR) return 1;
                    return (a.start_time ?? '').localeCompare(b.start_time ?? '');
                  });

                  if (savedEvents.length === 0) {
                    const hasAnySaved = events.some(e => favorites.has(e.id));
                    // Logged-out empty state — hard gate with friendly CTA
                    if (!isLoggedIn) {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
                          {/* Material: calendar_month */}
                          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '16px' }}>
                            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" fill={t.textMuted} />
                          </svg>
                          <p style={{ fontWeight: 700, fontSize: '18px', color: t.text, marginBottom: '6px', fontFamily: "'DM Sans', sans-serif" }}>
                            Start building your lineup.
                          </p>
                          <p style={{ fontSize: '14px', color: t.textMuted, lineHeight: 1.5, marginBottom: '20px', fontFamily: "'DM Sans', sans-serif" }}>
                            Save shows and follow artists to build your personal concert calendar.
                          </p>
                          <button onClick={() => openAuth('save')} style={{
                            padding: '13px 40px', borderRadius: '999px', border: 'none',
                            background: t.accent, color: 'white', fontWeight: 700, fontSize: '15px',
                            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                            boxShadow: '0 2px 12px rgba(232,114,42,0.3)',
                          }}>
                            Sign In
                          </button>
                        </div>
                      );
                    }
                    // Logged-in empty state (has saves but filtered to zero, or no saves yet)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
                        {/* Material: add_circle_outline */}
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '14px' }}>
                          <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill={t.textMuted} />
                        </svg>
                        <p style={{ fontWeight: 700, fontSize: '16px', color: t.text, marginBottom: '4px', fontFamily: "'DM Sans', sans-serif" }}>
                          {!hasAnySaved ? 'Your lineup is empty' : searchQuery ? 'No results found' : 'No upcoming saved events'}
                        </p>
                        <p style={{ fontSize: '14px', color: t.textMuted, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>
                          {!hasAnySaved ? 'Tap the + icon on any event to add it here.' : searchQuery ? 'Try a different search term' : 'Check back as new events are added'}
                        </p>
                      </div>
                    );
                  }
                  const savedGroups = groupEventsByDate(savedEvents);
                  return (
                    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1px', padding: '14px 0 2px' }}>
                        {savedEvents.length} saved event{savedEvents.length !== 1 ? 's' : ''}
                      </p>
                      {savedGroups.map(group => (
                        <div key={group.date}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0 6px' }}>
                            <span style={dateSeparatorStyle}>{group.label}</span>
                            <div style={{ flex: 1, height: '1px', background: t.border }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {group.events.map((event, i) => (
                              <SavedGigCard
                                key={event.id ?? i}
                                event={event}
                                isFavorited={true}
                                onToggleFavorite={toggleFavorite}
                                darkMode={darkMode}
                                onFollowArtist={(artistName) => {
                                  if (isFollowing('artist', artistName)) unfollowEntity('artist', artistName);
                                  else followEntity('artist', artistName);
                                }}
                                isArtistFollowed={isFollowing('artist', event.name || event.artist_name || '')}
                                onFlag={(msg) => setToast(msg)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
            })()}

            {/* View B: Following */}
            {savedSegment === 'following' && (
              <FollowingTab
                darkMode={darkMode}
                following={following}
                events={events}
                onUnfollow={unfollowEntity}
                onToggleNotif={toggleFollowNotif}
                onEntityTap={(entityType, entityName) => {
                  if (entityType === 'artist') setArtistProfile(entityName);
                  else setBottomSheet({ type: entityType, name: entityName });
                }}
                onFollow={followEntity}
                searchQuery={searchQuery}
              />
            )}
          </div>
        )}

        {/* ── Profile view ─────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg }}>
            <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #E8722A, #3AADA0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                {isLoggedIn && user?.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover' }} />
                  : '👤'
                }
              </div>
              <p style={{ fontWeight: 800, fontSize: '18px', color: t.text, marginTop: '8px' }}>
                {isLoggedIn ? (user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Your Profile') : 'Your Profile'}
              </p>
              {isLoggedIn ? (
                <p style={{ fontSize: '13px', color: t.textMuted }}>{user?.email}</p>
              ) : (
                <>
                  <p style={{ fontSize: '13px', color: t.textMuted }}>Sign in to save events across devices</p>
                  <button onClick={() => openAuth('profile')} style={{ marginTop: '12px', padding: '10px 32px', borderRadius: '999px', border: 'none', background: t.accent, color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    Sign In
                  </button>
                </>
              )}
            </div>
            <div style={{ margin: '0 16px', borderRadius: '12px', background: t.surface, overflow: 'hidden', boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.4)' : '0 1px 6px rgba(0,0,0,0.07)', border: `1px solid ${t.border}` }}>
              {[
                { icon: '🔔', label: 'Notifications',             toggle: 'notif'  },
                { icon: '🌙', label: 'Dark Mode', toggle: 'theme'  },
                { icon: '📍', label: 'Default Location',          soon: true       },
                { icon: '🎟', label: 'Add to the Jar',             action: () => setShowSubmit(true) },
                ...(isLoggedIn ? [{ icon: '🚪', label: 'Sign Out', action: handleSignOut, danger: true }] : []),
              ].map((item, i, arr) => (
                <button
                  key={item.label}
                  onClick={
                    item.toggle === 'notif' ? toggleNotifications
                    : item.toggle === 'theme' ? toggleDarkMode
                    : (item.action ?? null)
                  }
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '14px 16px', border: 'none', cursor: item.soon ? 'default' : 'pointer',
                    background: t.surface, borderBottom: i < arr.length - 1 ? `1px solid ${t.borderLight}` : 'none',
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: item.danger ? '#EF4444' : t.text, fontWeight: 500 }}>
                    <span>{item.icon}</span>{item.label}
                  </span>
                  {item.soon
                    ? <span style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, background: t.inputBg, padding: '2px 8px', borderRadius: '999px' }}>SOON</span>
                    : item.toggle === 'notif'
                    ? <div style={{ width: '44px', height: '24px', borderRadius: '999px', position: 'relative', background: notifEnabled ? t.accent : t.textSubtle, transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '3px', left: notifEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                      </div>
                    : item.toggle === 'theme'
                    ? <div style={{ width: '44px', height: '24px', borderRadius: '999px', position: 'relative', background: darkMode ? t.accent : t.textSubtle, transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '3px', left: darkMode ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                      </div>
                    : <span style={{ color: t.textMuted, fontSize: '12px' }}>›</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Event list (home tab) ─────────────────────────────────────── */}
        {activeTab === 'home' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: t.textMuted, fontSize: '15px' }}>
                Loading events…
              </div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
                <span style={{ fontSize: '48px', marginBottom: '12px' }}>🎵</span>
                <p style={{ fontWeight: 700, fontSize: '16px', color: t.text, marginBottom: '4px' }}>No events found</p>
                <p style={{ fontSize: '14px', color: t.textMuted }}>Try a different date, category, or venue</p>
              </div>
            ) : (
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {groupedEvents.map(group => (
                  <div key={group.date}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 0 6px' }}>
                      <span style={dateSeparatorStyle}>{group.label}</span>
                      <div style={{ flex: 1, height: '1px', background: t.border }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {group.events.map((event, i) => (
                        <EventCardV2
                          key={event.id ?? `${group.date}-${i}`}
                          event={event}
                          isFavorited={favorites.has(event.id)}
                          onToggleFavorite={toggleFavorite}
                          darkMode={darkMode}
                          onFollowArtist={(artistName) => {
                            if (isFollowing('artist', artistName)) unfollowEntity('artist', artistName);
                            else followEntity('artist', artistName);
                          }}
                          isArtistFollowed={isFollowing('artist', event.name || event.artist_name || '')}
                          onFlag={(msg) => setToast(msg)}
                          followExpanded={followExpandedCardId === event.id}
                          onFollowCollapse={() => setFollowExpandedCardId(null)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: navHidden ? 'translate(-50%, 100%)' : 'translateX(-50%)',
        transition: 'transform 0.3s ease',
        width: '100%', maxWidth: '480px', zIndex: 100,
        background: t.navBg, borderTop: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 0 calc(8px + env(safe-area-inset-bottom))',
        boxShadow: darkMode ? '0 -2px 20px rgba(0,0,0,0.5)' : '0 -2px 12px rgba(0,0,0,0.06)',
      }}>
        {[
          { key: 'home',    label: 'Home'    },
          { key: 'search',  label: 'Search'  },
          { key: 'saved',   label: 'My Jam'  },
          { key: 'profile', label: 'Profile' },
        ].map(tab => (
          <button key={tab.key} onClick={() => {
            if (tab.key === 'search') {
              // Toggle: if panel is already open, close it; otherwise open
              if (filtersExpanded) {
                setFiltersExpanded(false);
                setActiveFilterCard(null);
              } else {
                openSearch();
              }
            } else if (tab.key === 'home' && activeTab === 'home') {
              // Already on Home — reset everything: blur keyboard, clear search, collapse omnibar, clear filters
              document.activeElement?.blur();
              clearAllFilters();
            } else {
              if (tab.key === 'saved') handleSetSavedSegment('events');
              setActiveTab(tab.key);
            }
          }} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 16px',
            color: (tab.key === 'search' ? (searchFocused || (activeTab === 'home' && filtersExpanded)) : activeTab === tab.key) ? t.accent : t.textMuted,
            transition: 'color 0.15s',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              {tab.key === 'home' && (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor" /></svg>
              )}
              {tab.key === 'search' && (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor" /></svg>
              )}
              {tab.key === 'saved' && (
                /* Material: library_music */
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 5h-3v5.5a2.5 2.5 0 01-2.5 2.5A2.5 2.5 0 0110 12.5a2.5 2.5 0 012.5-2.5c.57 0 1.08.19 1.5.51V5h4v2zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z" fill="currentColor" /></svg>
              )}
              {tab.key === 'profile' && (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor" /></svg>
              )}
            </span>
            <span style={{ fontSize: '10px', fontWeight: (tab.key === 'search' ? (searchFocused || (activeTab === 'home' && filtersExpanded)) : activeTab === tab.key) ? 700 : 500 }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Map modal ───────────────────────────────────────────────────── */}
      {mapOpen && (
        <MapView events={filteredEvents} onClose={() => setMapOpen(false)} darkMode={darkMode} />
      )}

      {/* ── Artist Profile Screen ─────────────────────────────────────────── */}
      {artistProfile && (
        <ArtistProfileScreen
          artistName={artistProfile}
          events={events}
          darkMode={darkMode}
          isFollowed={isFollowing('artist', artistProfile)}
          onFollow={() => followEntity('artist', artistProfile)}
          onUnfollow={() => unfollowEntity('artist', artistProfile)}
          onBack={() => setArtistProfile(null)}
        />
      )}

      {/* ── Bottom Sheet (Phase 2 — entity profile) ───────────────────────── */}
      {bottomSheet && (
        <EntityBottomSheet
          type={bottomSheet.type}
          name={bottomSheet.name}
          events={events}
          darkMode={darkMode}
          isFollowing={isFollowing(bottomSheet.type, bottomSheet.name)}
          onFollow={() => followEntity(bottomSheet.type, bottomSheet.name)}
          onUnfollow={() => unfollowEntity(bottomSheet.type, bottomSheet.name)}
          onClose={() => setBottomSheet(null)}
        />
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showSubmit && (
        <SubmitEventModal darkMode={darkMode} onClose={() => setShowSubmit(false)} onSubmit={() => { setToastVariant('success'); setToast('Dropped in the Jar! We\'ll review it shortly.'); }} />
      )}
      {/* ReportIssueModal removed — flagging now handled inline in EventCardV2 */}

      {/* ── Welcome Modal (first-time visitors) ─────────────────────────── */}
      {showWelcome && (
        <WelcomeModal
          darkMode={darkMode}
          onSignIn={() => {
            try { localStorage.setItem('mlj_hasSeenWelcomeModal', 'true'); } catch {}
            setShowWelcome(false);
            openAuth('profile');
          }}
          onDismiss={() => {
            try { localStorage.setItem('mlj_hasSeenWelcomeModal', 'true'); } catch {}
            setShowWelcome(false);
          }}
        />
      )}

      {/* ── Auth Modal ──────────────────────────────────────────────────── */}
      {showAuthModal && (
        <AuthModal
          darkMode={darkMode}
          trigger={authTrigger}
          onClose={() => { setShowAuthModal(false); setAuthTrigger(null); }}
        />
      )}

      {/* Follow upsell now rendered inline in EventCardV2 */}

      {toast && <Toast message={toast} variant={toastVariant} onAction={toastAction} actionLabel={toastActionLabel} onDismiss={() => { setToast(null); setToastVariant(null); setToastAction(null); setToastActionLabel(null); }} />}
    </>
  );
}
