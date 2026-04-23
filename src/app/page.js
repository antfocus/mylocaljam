'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { posthog } from '@/lib/posthog';
import { getVenueColor, groupEventsByDate } from '@/lib/utils';
import { requestNotificationPermission, scheduleReminder, cancelReminder, rehydrateReminders, notificationsGranted } from '@/lib/notifications';

import HeroSection       from '@/components/HeroSection';
import HeroPiston        from '@/components/HeroPiston';
import EventCardV2       from '@/components/EventCardV2';
import SavedGigCard      from '@/components/SavedGigCard';
import MapView           from '@/components/MapView';
import SubmitEventModal  from '@/components/SubmitEventModal';
import AuthModal         from '@/components/AuthModal';
import WelcomeModal      from '@/components/WelcomeModal';
import Toast             from '@/components/Toast';
import FollowingTab      from '@/components/FollowingTab';
import ArtistProfileScreen from '@/components/ArtistProfileScreen';
import SupportModal      from '@/components/SupportModal';
import BetaWelcome       from '@/components/BetaWelcome';
import ArtistSpotlight   from '@/components/ArtistSpotlight';
import ModalWrapper      from '@/components/ui/ModalWrapper';

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
  karaoke_mic: 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
  quiz: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z',
  local_offer: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
  location_on: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  dark_mode: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z',
  mail: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  notifications_active: 'M7.58 4.08L6.15 2.65C3.75 4.48 2.17 7.3 2.03 10.5h2c.15-2.65 1.51-4.97 3.55-6.42zm12.39 6.42h2c-.15-3.2-1.73-6.02-4.12-7.85l-1.42 1.43c2.02 1.45 3.39 3.77 3.54 6.42zM18 11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2v-5zm-6 11c.14 0 .27-.01.4-.04.65-.14 1.18-.58 1.44-1.18.1-.24.15-.5.15-.78h-4c.01 1.1.9 2 2.01 2z',
  calendar_month: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z',
  key: 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  email: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  chat_bubble: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  help_outline: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',
  policy: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
  park: 'M17 12h2L12 2 5 12h2l-4 6h7v4h4v-4h7l-4-6z',
  celebration: 'M2 22l14-5-9-9-5 14zm12.53-9.47l5.59-5.59c.49-.49 1.28-.49 1.77 0l.59.59 1.06-1.06-.59-.59c-1.07-1.07-2.82-1.07-3.89 0l-5.59 5.59 1.06 1.06zm-4.47-5.65l-.59.59 1.06 1.06.59-.59c1.07-1.07 1.07-2.82 0-3.89l-.59-.59-1.06 1.06.59.59c.48.49.48 1.28 0 1.77z',
  nightlife: 'M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7L5.66 5h12.69l-1.78 2H7.43z',
  pets: 'M4.5 9.5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M9 5.5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M15 5.5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M19.5 9.5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M17.34 14.86c-.87-1.02-1.6-1.89-2.48-2.91-.46-.54-1.17-.95-1.87-.95h-2c-.69 0-1.39.41-1.86.95-.87 1.02-1.6 1.89-2.48 2.91-1.31 1.31-2.92 2.76-2.62 4.79.29 1.02 1.02 2.0 2.09 2.35 1.17.38 2.42-.13 3.4-.84l.51-.38a1.998 1.998 0 012.96 0l.51.38c.98.71 2.23 1.22 3.4.84 1.07-.35 1.8-1.33 2.09-2.35.3-2.03-1.31-3.48-2.62-4.79z',
  outdoor_grill: 'M17 22c1.66 0 3-1.34 3-3s-1.34-3-3-3c-1.3 0-2.4.84-2.82 2H9.14l1.99-3.06c.29.04.58.06.87.06 3.87 0 7-3.13 7-7 0-.84-.15-1.65-.41-2.4l-1.53.63c.17.56.26 1.15.26 1.77 0 2.93-2.07 5.37-4.82 5.93L14.72 13H21V3H3v10h3.28l2.22 3.42-3.05 4.7c-.34.52-.15 1.22.42 1.52.19.1.39.15.59.15.38 0 .75-.19.96-.52L9.28 19h4.9c.42 1.16 1.52 2 2.82 2zM5 5h14v6H5V5z',
  deck: 'M22 9L12 2 2 9h9v13h2V9h9zM4.5 11L2 22h3l1.5-7.5L4.5 11zm15 0l-2 3.5L19 22h3l-2.5-11z',
};

// ── Hardcoded shortcut pills (replaces DB-driven dbPills for these categories) ──
const SHORTCUT_PILLS = [
  { id: 'live-music',   label: 'Live Music',   icon: 'music_note',    filter_type: 'keyword', filter_config: { terms: ['live music'] } },
  { id: 'happy-hour',   label: 'Happy Hour',   icon: 'sports_bar',    filter_type: 'keyword', filter_config: { terms: ['happy hour'] } },
  { id: 'nightlife',    label: 'Nightlife',    icon: 'nightlife',     filter_type: 'time',    filter_config: { after_hour: 21 } },
  { id: 'breweries',    label: 'Breweries',    icon: 'sports_bar',    filter_type: 'venue_type', filter_config: { venue_types: ['Brewery', 'Brewpub'] } },
  { id: 'karaoke',      label: 'Karaoke',      icon: 'karaoke_mic',   filter_type: 'keyword', filter_config: { terms: ['karaoke'] } },
  { id: 'trivia',       label: 'Trivia',       icon: 'quiz',          filter_type: 'keyword', filter_config: { terms: ['trivia', 'quiz'] } },
  { id: 'outdoor',      label: 'Outdoor',      icon: 'deck',          filter_type: 'venue_tag', filter_config: { tags: ['Outdoor', 'Outdoor Seating', 'Patio', 'Rooftop'] } },
  { id: 'dog-friendly', label: 'Dog Friendly', icon: 'pets',          filter_type: 'venue_tag', filter_config: { tags: ['Dog Friendly', 'Pet Friendly'] } },
];

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
                background: t.accent, color: '#1C1917', fontSize: '10px', fontWeight: 800,
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
  const [deepLinkEventId, setDeepLinkEventId] = useState(null);     // auto-expand from shared link
  const [mapOpen,        setMapOpen]        = useState(false);
  const [dateKey,        setDateKey]        = useState('all');
  const [pickedDate,     setPickedDate]     = useState('');        // YYYY-MM-DD for 'pick' dateKey
  const [searchQuery,    setSearchQuery]    = useState('');
  const [activeVenues,   setActiveVenues]   = useState([]);    // multi-select venue filter
  const [milesRadius,    setMilesRadius]    = useState(null);  // null = any distance
  const profileRadiusRef = useRef(null); // saved profile default (null for guests)
  const [showSubmit,     setShowSubmit]     = useState(false);
  const [showSupport,    setShowSupport]    = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeFilterCard, setActiveFilterCard] = useState(null); // 'distance' | 'when' | 'artist' | 'venue'
  const [spotlightEvent, setSpotlightEvent] = useState(null);   // event for ArtistSpotlight overlay

  // ── Hero carousel dot state (lifted from HeroSection for overlay rendering) ──
  const heroRef = useRef(null);
  const [heroSlide, setHeroSlide] = useState({ active: 0, total: 0 });
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
  const [authReady, setAuthReady] = useState(false);             // true once getSession resolves
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTrigger, setAuthTrigger] = useState(null);            // 'save' | 'submit' | 'profile' | null
  const [showWelcome, setShowWelcome] = useState(false);
  // ── Edit Profile modal state ─────────────────────────────────────────────
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [emailChangeNote, setEmailChangeNote] = useState(null); // null | 'pending' | 'sent'
  const [editProfileSaving, setEditProfileSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  // ── Notification state ───────────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [emailNotifPref, setEmailNotifPref] = useState(true);
  const [inAppNotifPref, setInAppNotifPref] = useState(true);
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
  const [showCalendar, setShowCalendar] = useState(false);  // custom calendar grid visibility (filter card)
  const [showHeaderCalendar, setShowHeaderCalendar] = useState(false); // same grid, opened from the date-group header icon
  // Viewport y-position to anchor the header calendar popup to (captured from
  // the triggering date header's bottom edge). null when closed.
  const [calAnchorTop, setCalAnchorTop] = useState(null);
  const [calViewDate, setCalViewDate] = useState(() => new Date()); // month being viewed (not selected)
  const savedDatePickOpenVal = useRef('');
  const searchInputRef = useRef(null);
  const pendingSearchFocus = useRef(false);    // fallback for tab-switch focus
  const [searchFocused, setSearchFocused] = useState(false);  // visual threading
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAutoComplete, setShowAutoComplete] = useState(false);

  // Bottom nav is permanently visible — scroll hide/show removed.

  // ── Debounce searchQuery → debouncedSearch (300ms) ─────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── App-shell scroll lock (pairs with body.app-shell-lock in globals.css) ──
  // The home app is a fixed-height flex column (`100svh`) with an inner scroll
  // container (homeScrollRef). Without this lock, iOS Safari can body-scroll
  // the wrapper via the 100vh/100svh gap (keyboard open, URL-bar collapse,
  // overscroll rubber-band) and drag the sticky top header off screen — and
  // scrolling the inner container can't bring it back. Scoped to this page
  // so /admin (document scroll) is unaffected.
  useEffect(() => {
    document.body.classList.add('app-shell-lock');
    return () => document.body.classList.remove('app-shell-lock');
  }, []);

  // ── Autocomplete suggestions from in-memory events (debounced) ─────────────
  //
  // Classification rules (2026-04-21, revised):
  //   • Rows with a real joined artist (e.artists?.name) → badge "ARTIST",
  //     unless the name itself looks like an event title or drink special.
  //   • Rows whose title matches an event-type keyword → badge reflects the
  //     event type (karaoke, trivia, bingo, festival, …). We used to label
  //     every event-type title "FESTIVAL" which mis-represented Karaoke,
  //     Trivia, Open-Mic, etc.
  //   • Rows whose title matches a drink/food-special pattern ($2 pints,
  //     Happy Hour, BOGO, wing night, power hour, Miller/Coors/Bud Lite
  //     variants, …) → badge "SPECIAL". Users do search for these by
  //     name; they just shouldn't be mis-labeled ARTIST or FESTIVAL.
  //   • Rows whose artist FK isn't linked but have a reasonable-looking
  //     event_title/artist_name (<=50 chars, no event keyword match, not
  //     a drink special) fall through to the ARTIST bucket. This is the
  //     common case for scraper rows that haven't been enriched yet —
  //     without it, the dropdown stays empty for most searches.
  const autoCompleteSuggestions = useMemo(() => {
    const rawQ = (debouncedSearch ?? '').trim().toLowerCase();
    if (!rawQ || rawQ.length < 2 || !events.length) return [];
    const q = normalizeVenue(debouncedSearch);

    // Keyword → display-label map. Order matters: first match wins, so put
    // the most specific patterns (karaoke, trivia) above the generic
    // catch-all ones (event, festival).
    const EVENT_TYPE_LABELS = [
      { re: /\bkaraoke\b/i,                                                          label: 'karaoke' },
      { re: /\btrivia\b/i,                                                           label: 'trivia' },
      { re: /\bbingo\b/i,                                                            label: 'bingo' },
      { re: /\bopen\s+mic\b/i,                                                       label: 'open mic' },
      { re: /\bcomedy(\s+show|\s+night)?\b/i,                                        label: 'comedy' },
      { re: /\b(festival|fest\b|fair|carnival|jamboree|block\s+party)\b/i,           label: 'festival' },
      { re: /\b(fundraiser|benefit(\s+show|\s+concert)?|charity\s+drive)\b/i,        label: 'fundraiser' },
      { re: /\b(parade|rodeo|5k|fireworks|car\s+show|craft\s+fair|memorial|recreation)\b/i, label: 'event' },
    ];

    // Drink/food specials — never suggest these. They pollute the dropdown
    // because the scraper parks raw promo copy in `artist_name`/`event_title`
    // when it can't extract a real headliner.
    const DRINK_SPECIAL_RE = /(\$\s*\d|\bhappy\s+hour\b|\bbogo\b|\bhalf[-\s]price\b|\b2\s*for\s*1\b|\bwing\s+night\b|\btaco\s+tuesday\b|\bburger\s+night\b|\bladies\s+night\b|\bpower\s+hour\b|\bbottomless\b|\b(?:miller|coors|bud|yuengling|high\s+noons?)\s+(?:lite|light|draft|pints?)?\b|\bdraft\s+beers?\b|\bpints?\s+til\b|\bdrink\s+special\b|\bfood\s*&?\s*drink\s+special\b)/i;

    function classifyTitle(title) {
      if (!title) return null;
      // Drink/food specials get their own badge instead of being dropped.
      // They're real events users search for (Happy Hour, BOGO, $2 Miller);
      // the original problem was mis-labeling them FESTIVAL, not their
      // presence in the dropdown.
      if (DRINK_SPECIAL_RE.test(title)) return 'special';
      for (const { re, label } of EVENT_TYPE_LABELS) {
        if (re.test(title)) return label;
      }
      return null;
    }

    const artistSet = new Map();   // normalized → display name
    const venueSet  = new Map();   // normalized → display name
    const eventSet  = new Map();   // normalized → { label, display }

    for (const e of events) {
      // Artists: require a real linked artist row (the `artists` join only
      // populates when artist_id FK is set). Skip names that look like
      // event titles or drink specials so mis-placed scraper rows never
      // get mis-labeled "ARTIST".
      const artistName = (e.artists?.name ?? '').trim();
      if (artistName
          && artistName.length <= 50
          && !classifyTitle(artistName)
          && !DRINK_SPECIAL_RE.test(artistName)) {
        const key = artistName.toLowerCase();
        if (key.includes(q) && !artistSet.has(key)) artistSet.set(key, artistName);
      }

      // Venues: from joined venue data
      const venue = (e.venue ?? '').trim();
      if (venue) {
        const key = venue.toLowerCase();
        if (key.includes(q) && !venueSet.has(key)) venueSet.set(key, venue);
      }

      // Event titles (with `artist_name` fallback for un-linked scraper
      // rows where the descriptive name lives there instead of
      // `event_title`). Classify by keyword; otherwise fall through to
      // the ARTIST bucket so un-enriched rows still surface — but only
      // if they pass the drink-special filter and look like a real name.
      //
      // DEDUP GUARD: when the row has a linked canonical artist
      // (e.artists?.name set), its canonical was already added to
      // artistSet above. We must NOT also fall through to the ARTIST
      // bucket here using the stale/scraper `artist_name` — that was
      // the post-merge bug where ghost strings like "Mike Dalton 6pm"
      // and "MIKE DALTON BAND WITH HORNS" surfaced as separate ARTIST
      // entries alongside canonical "Mike Dalton".
      const rawTitle = (e.event_title ?? '').trim() || (e.artist_name ?? '').trim();
      if (rawTitle) {
        const key = normalizeVenue(rawTitle);
        if (key.includes(q)) {
          const label = classifyTitle(rawTitle);
          if (label) {
            if (!eventSet.has(key)) {
              eventSet.set(key, { label, display: rawTitle });
            }
          } else if (
            rawTitle.length <= 50
            && !DRINK_SPECIAL_RE.test(rawTitle)
            && !artistName                       // ← guard: don't double-add when a canonical is already attached
          ) {
            // Un-classified, non-special rawTitle → treat as artist so the
            // dropdown still surfaces scraper rows where the artist FK
            // hasn't been linked yet.
            const akey = rawTitle.toLowerCase();
            if (!artistSet.has(akey)) artistSet.set(akey, rawTitle);
          }
        }
      }
    }

    const results = [];
    // Event-type matches first (most specific), then venues, then artists.
    for (const [, entry] of eventSet) {
      if (results.length >= 6) break;
      results.push({ type: entry.label, label: entry.display });
    }
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
    posthog.reset?.();
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

  // ── Swipe support for saved tab segments ──────────────────────────────────
  const savedSwipeRef = useRef(null);
  const savedSegmentSetRef = useRef(null); // ref avoids TDZ — handleSetSavedSegment defined later
  const handleSavedTouchStart = useCallback((e) => {
    savedSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleSavedTouchEnd = useCallback((e) => {
    if (!savedSwipeRef.current) return;
    const dx = e.changedTouches[0].clientX - savedSwipeRef.current.x;
    const dy = e.changedTouches[0].clientY - savedSwipeRef.current.y;
    savedSwipeRef.current = null;
    // Only register horizontal swipes (dx > 60px, and more horizontal than vertical)
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) savedSegmentSetRef.current?.('following'); // swipe left → Artists
    else savedSegmentSetRef.current?.('events');            // swipe right → Shows
  }, []);

  // Refs for the follow upsell — lets toggleFavorite call follow logic defined later without TDZ issues
  const followingRef = useRef([]);
  const followEntityRef = useRef(null);
  const homeScrollRef = useRef(null); // scroll container for home event list — used by double-tap-home
  // Refs for stable callbacks — avoids recreating useCallbacks on every state change
  const isLoggedInRef = useRef(false);
  const favoritesRef = useRef(new Set());

  // Save an event to Supabase (extracted so the Follow Action Sheet can call it)
  const saveEventToDb = useCallback(async (id) => {
    setFavorites(prev => { const next = new Set(prev); next.add(id); return next; });
    const event = events.find(e => e.id === id);
    if (event && notifEnabled) scheduleReminder(event);
    // PostHog: track event bookmarked
    if (event) {
      posthog.capture?.('event_bookmarked', {
        event_id: id,
        artist_name: event.name || event.artist_name || '',
        venue_name: event.venue || event.venue_name || '',
      });
    }
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
    if (!isLoggedInRef.current) {
      openAuth('save');
      return;
    }
    const isSaved = favoritesRef.current.has(id);

    if (isSaved) {
      unsaveEventFromDb(id);
      return;
    }

    // Not saved yet — save immediately (popover upsell is handled inside EventCardV2)
    saveEventToDb(id);
  }, [openAuth, unsaveEventFromDb, saveEventToDb]);

  // ── Saved tab segment toggle (persisted per-session) ──────────────────────
  const [savedSegment, setSavedSegment] = useState(() => {
    if (typeof window === 'undefined') return 'events';
    return sessionStorage.getItem('mlj_saved_segment') || 'events';
  });

  const [savedTimeView, setSavedTimeView] = useState('upcoming'); // 'upcoming' | 'past'

  const handleSetSavedSegment = useCallback((seg) => {
    setSavedSegment(seg);
    try { sessionStorage.setItem('mlj_saved_segment', seg); } catch {}
  }, []);
  // Sync ref so swipe handlers (defined earlier) can call it without TDZ
  useEffect(() => { savedSegmentSetRef.current = handleSetSavedSegment; }, [handleSetSavedSegment]);

  // ── Following state (Supabase — auth required) ─────────────────────────────
  const [following, setFollowing] = useState([]);
  // Sync followingRef (declared before toggleFavorite) so it always has current state
  useEffect(() => { followingRef.current = following; }, [following]);
  // Sync stable-callback refs so useCallbacks with [] deps always read current values
  useEffect(() => { isLoggedInRef.current = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);

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
    if (!isLoggedInRef.current) {
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
    // PostHog: track local followed
    if (entityType === 'artist') {
      posthog.capture?.('Local Followed', {
        artist_name: entityName,
      });
    }
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
  }, [openAuth]);

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

  // ── Stable Set for memoized card props ───────────────────────────────────
  const followedArtistNames = useMemo(() => {
    return new Set(following.filter(f => f.entity_type === 'artist').map(f => f.entity_name));
  }, [following]);

  // ── Stable callback refs for memoized child cards ────────────────────────
  const handleFollowArtist = useCallback((artistName) => {
    const currentFollowing = followingRef.current;
    const alreadyFollowed = currentFollowing.some(f => f.entity_type === 'artist' && f.entity_name === artistName);
    if (alreadyFollowed) unfollowEntity('artist', artistName);
    else followEntity('artist', artistName);
  }, [followEntity, unfollowEntity]);

  const handleFlag = useCallback((msg) => {
    setToast(msg);
  }, []);

  // ── Bottom sheet state ────────────────────────────────────────────────────
  const [bottomSheet, setBottomSheet] = useState(null); // { type: 'venue'|'artist', name, entityId? }
  const [artistProfile, setArtistProfile] = useState(null); // artist name string or null

  // ── Pagination state ─────────────────────────────────────────────────────────
  const [currentPage,  setCurrentPage]  = useState(1);
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [totalEvents,  setTotalEvents]  = useState(0);
  const PAGE_SIZE = 20;
  // Sentinel ref for IntersectionObserver infinite scroll
  const sentinelRef = useRef(null);
  // Track the latest fetch request to avoid stale responses
  const fetchIdRef = useRef(0);

  // ── Compute server-side params from current filter state ──────────────────
  // Memoized so the fetch effect only re-fires when actual params change.
  const serverParams = useMemo(() => {
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const today = new Date();
    const todayFmt = fmt(today);
    let dateFrom = todayFmt;
    let dateTo = null;

    switch (dateKey) {
      case 'today':
        dateFrom = todayFmt;
        dateTo = todayFmt;
        break;
      case 'tomorrow': {
        const t = new Date(today); t.setDate(t.getDate() + 1);
        dateFrom = fmt(t);
        dateTo = fmt(t);
        break;
      }
      case 'weekend': {
        const d = new Date(today); const day = d.getDay();
        if (day === 5) { /* already friday */ }
        else if (day === 6) { d.setDate(d.getDate() - 1); }
        else if (day === 0) { d.setDate(d.getDate() - 2); }
        else { d.setDate(d.getDate() + (5 - day)); }
        const fri = fmt(d);
        dateFrom = todayFmt > fri ? todayFmt : fri;
        const sun = new Date(d); sun.setDate(d.getDate() + 2);
        dateTo = fmt(sun);
        break;
      }
      case 'pick':
        if (pickedDate) { dateFrom = pickedDate; dateTo = pickedDate; }
        break;
      default: // 'all'
        dateFrom = todayFmt;
        dateTo = null;
        break;
    }

    return { dateFrom, dateTo, q: debouncedSearch.trim() || null };
  }, [dateKey, pickedDate, debouncedSearch]);

  // ── Fetch from /api/events/search ────────────────────────────────────────────
  // Replaces the old direct Supabase client fetch. The server now handles:
  //   • Text search (trigram ILIKE via pg_trgm indexes)
  //   • Date range filtering (Eastern-aware)
  //   • The full Metadata Waterfall (applyWaterfall)
  //   • Pagination via .range()
  // Client still handles: distance filter, shortcut pills, sort order.
  const fetchEvents = useCallback(async (page = 1, append = false) => {
    const fetchId = ++fetchIdRef.current;
    if (page === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (serverParams.dateFrom) params.set('date_from', serverParams.dateFrom);
      if (serverParams.dateTo) params.set('date_to', serverParams.dateTo);
      if (serverParams.q) params.set('q', serverParams.q);

      const res = await fetch(`/api/events/search?${params.toString()}`);
      if (!res.ok) throw new Error(`Search API returned ${res.status}`);
      const json = await res.json();

      // Guard against stale responses from superseded requests
      if (fetchId !== fetchIdRef.current) return;

      const incoming = json.data || [];
      if (append) {
        setEvents(prev => [...prev, ...incoming]);
      } else {
        setEvents(incoming);
      }
      setCurrentPage(json.page);
      setHasMore(json.hasMore);
      setTotalEvents(json.total);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
    if (page === 1) setLoading(false);
    else setLoadingMore(false);
  }, [serverParams]);

  const [spotlightData, setSpotlightData] = useState([]);

  // ── Initial mount + re-fetch when server params change ──────────────────────
  // Reset to page 1 whenever search, date filter, or dateKey changes.
  useEffect(() => {
    setCurrentPage(1);
    setHasMore(false);
    fetchEvents(1, false);
  }, [fetchEvents]);

  // ── Load more (next page) ─────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchEvents(currentPage + 1, true);
  }, [loadingMore, hasMore, currentPage, fetchEvents]);

  // Keep a ref to the latest loadMore so the IntersectionObserver callback
  // never holds a stale closure (avoids "stuck scroll" when the sentinel
  // stays visible after a batch loads and the observer doesn't re-fire).
  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // ── IntersectionObserver for infinite scroll ──────────────────────────────
  // Uses a callback ref so the observer attaches as soon as the sentinel mounts.
  const sentinelObserver = useRef(null);
  const sentinelCallbackRef = useCallback((node) => {
    // Disconnect previous observer if any
    if (sentinelObserver.current) {
      sentinelObserver.current.disconnect();
      sentinelObserver.current = null;
    }
    sentinelRef.current = node;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    sentinelObserver.current = observer;
  }, []);

  // Re-check after each fetch in case sentinel is still in view
  useEffect(() => {
    if (!loadingMore && hasMore && sentinelRef.current) {
      const rect = sentinelRef.current.getBoundingClientRect();
      const inView = rect.top < window.innerHeight + 400;
      if (inView) loadMoreRef.current();
    }
  }, [loadingMore, hasMore]);
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
    // Check current session on mount — identify existing users silently
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setIsLoggedIn(!!u);
      setAuthReady(true);
      if (u) {
        posthog.identify?.(u.id, { email: u.email });
      }
    });
    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setIsLoggedIn(!!u);
      if (u) {
        posthog.identify?.(u.id, { email: u.email });
        // Track sign-in event (SIGNED_IN fires on new login, not token refresh)
        if (event === 'SIGNED_IN') {
          const provider = u.app_metadata?.provider || (u.app_metadata?.providers || [])[0] || 'email';
          const method = provider === 'google' ? 'google' : 'magic_link';
          const isNew = u.created_at && (Date.now() - new Date(u.created_at).getTime()) < 60000;
          posthog.capture?.('User Signed In', { method, is_new_user: isNew });
        }
      }
      if (u && showAuthModal) {
        // User just signed in — close modal
        setShowAuthModal(false);
        setAuthTrigger(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle URL query params — split into auth-dependent and data-only ──────

  // Data deep-links: ?event=<id> — fire immediately, no auth dependency
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const eventParam = params.get('event');
    if (eventParam) {
      setDeepLinkEventId(eventParam);
      setActiveTab('home');
      window.history.replaceState({}, '', '/');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auth redirects: ?signup=true / ?login=true — deferred until session is known
  useEffect(() => {
    if (!authReady) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('signup') === 'true' || params.get('login') === 'true') {
      const wantsSignup = params.get('signup') === 'true';
      window.history.replaceState({}, '', '/');
      if (!isLoggedIn) {
        setShowAuthModal(true);
        setAuthTrigger(wantsSignup ? 'save' : null);
      }
    }
  }, [authReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once events finish loading and we have a deep-link target, scroll + auto-expand
  useEffect(() => {
    if (!deepLinkEventId || loading) return;
    // Give the DOM a beat to render the card (autoExpand prop handles opening)
    const timer = setTimeout(() => {
      const el = document.getElementById(`event-${deepLinkEventId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid #E8722A';
        el.style.outlineOffset = '2px';
        el.style.borderRadius = '12px';
        setTimeout(() => { el.style.outline = 'none'; }, 3000);
      }
      // Clear deep-link so it doesn't persist across tab switches
      setDeepLinkEventId(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [deepLinkEventId, loading]);

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

  // ── Fetch notifications for logged-in users (poll every 60s) ────────────
  const fetchNotifications = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/notifications?limit=30', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch {}
  }, [isLoggedIn]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // poll every 60s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markNotificationsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ all: true }),
      });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  }, [unreadCount]);

  const markSingleNotificationRead = useCallback(async (notifId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: [notifId] }),
      });
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  }, []);

  const clearAllNotifications = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ all: true }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  }, []);

  const dismissNotification = useCallback(async (notifId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: [notifId] }),
      });
      setNotifications(prev => {
        const removed = prev.find(n => n.id === notifId);
        if (removed && !removed.is_read) setUnreadCount(c => Math.max(0, c - 1));
        return prev.filter(n => n.id !== notifId);
      });
    } catch {}
  }, []);

  // ── Fetch notification preferences when logged in ──────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/notification-prefs', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEmailNotifPref(data.email_enabled !== false);
          setInAppNotifPref(data.in_app_enabled !== false);
          // Initialize distance filter from saved preference
          const savedRadius = data.search_radius ?? null;
          profileRadiusRef.current = savedRadius;
          setMilesRadius(savedRadius);
        }
      } catch {}
    })();
  }, [isLoggedIn]);

  const toggleNotifPref = useCallback(async (key) => {
    const newVal = key === 'email' ? !emailNotifPref : !inAppNotifPref;
    if (key === 'email') setEmailNotifPref(newVal);
    else setInAppNotifPref(newVal);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/notification-prefs', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          key === 'email' ? { email_enabled: newVal } : { in_app_enabled: newVal }
        ),
      });
    } catch {}
  }, [emailNotifPref, inAppNotifPref]);

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

  // Fetch spotlight events for today (hydrated with venue + artist data)
  useEffect(() => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    fetch(`/api/spotlight?date=${today}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) { setSpotlightData([]); return; }
        // Normalize spotlight events using the same mapping as fetchEvents
        // cleanImg / cleanStr treat "", "None", and whitespace-only as null
        const cleanImg = (v) => (v && v !== 'None' && v !== '') ? v : null;
        const cleanStr = (v) => (v && v.trim() && v.trim() !== 'None') ? v.trim() : null;
        const mapped = data.map(e => {
          // Start-time ladder: template Master Time wins over raw start_time;
          // existing event_date fallback preserved below.
          let extractedStartTime = e.event_templates?.start_time || e.start_time || (() => {
            if (e.event_date && e.event_date.includes('T')) {
              const d = new Date(e.event_date);
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
          if (extractedStartTime === '00:00' || extractedStartTime === '24:00') {
            extractedStartTime = null;
          }
          return {
            ...e,
            id:            e.id || e.event_id,
            name:          decodeEntities(e.artists?.name || e.artist_name || ''),
            // ── SERVER-FIRST MAPPING (Option A surgical patch) ─────────
            // /api/spotlight runs the full Data Inheritance Waterfall on
            // the server via `applyWaterfall` — including the Verified
            // Lock, Midnight Exception, and the batched name-match artist
            // fallback for unlinked events. Those resolved fields arrive
            // on the payload as `e.event_title`, `e.category`,
            // `e.start_time`, `e.description`, `e.event_image`.
            //
            // We prefer the server answer for every field it resolves.
            // The legacy client ladders are retained ONLY as a defense-
            // in-depth safety net: if a future consumer calls this route
            // without the waterfall (or a legacy cached response is still
            // in flight), the UI still degrades gracefully.
            //
            // `e.artists?.image_url` is now included as a client-side
            // tier so hard-linked (artist_id set, FK embed hydrated)
            // artists also render through the local path if the server
            // field is ever absent.
            //
            // Title — server wins.
            event_title:   e.event_title
                           || e.custom_title
                           || e.event_templates?.template_name
                           || null,
            // Category — server wins (Verified-Lock aware on server).
            category:      e.category || e.event_templates?.category || 'Other',
            venue:         e.venues?.name || e.venue_name || '',
            date: (() => {
              const raw = e.event_date || '';
              if (!raw) return '';
              if (raw.includes('T')) {
                const d = new Date(raw);
                return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
              }
              return raw.substring(0, 10);
            })(),
            // Start-time — server waterfall applies Midnight Exception +
            // event_date derivation, so `e.start_time` is already the
            // final answer. Fall back to the client's event_date
            // extractor only if the server returned null/empty.
            start_time:    e.start_time || extractedStartTime,
            // Bio — server-resolved `e.description` wins. Server's
            // waterfall now reaches the artist tier even for unlinked
            // events (name-match fallback), so the hero bio drawer works
            // for rows like Mariel's trombone show.
            description:   cleanStr(e.description)
                           || cleanStr(e.custom_bio)
                           || cleanStr(e.event_templates?.bio)
                           || cleanStr(e.artists?.bio)
                           || cleanStr(e.artist_bio)
                           || '',
            artist_genres: e.custom_genres?.length ? e.custom_genres : (e.genre ? [e.genre] : (e.artists?.genres || [])),
            artist_vibes:  e.custom_vibes?.length ? e.custom_vibes : (e.vibe ? [e.vibe] : (e.artists?.vibes || [])),
            is_tribute:    e.artists?.is_tribute || false,
            // Image — server-resolved `e.event_image` wins. Includes the
            // artist-tier fallback on the server, so unlinked artist
            // photos (e.g. Mariel's trombone shot) finally reach the
            // hero. Local ladder retained for defense in depth, now with
            // `e.artists?.image_url` so hard-linked rows also survive
            // any server-field regression.
            event_image:   cleanImg(e.event_image)
                           || cleanImg(e.custom_image_url)
                           || cleanImg(e.event_templates?.image_url)
                           || cleanImg(e.event_image_url)
                           || cleanImg(e.image_url)
                           || cleanImg(e.artists?.image_url)
                           || null,
            artist_image:  cleanImg(e.artists?.image_url) || null,
            venue_type:    e.venues?.venue_type || null,
            venue_tags:    e.venues?.tags || [],
            venue_name:    e.venues?.name    || e.venue_name    || '',
            venue_address: e.venues?.address || '',
            venue_color:   e.venues?.color   || getVenueColor(e.venues?.name || e.venue_name),
            venue_lat:     e.venues?.latitude  || null,
            venue_lng:     e.venues?.longitude || null,
          };
        });
        setSpotlightData(mapped);
      })
      .catch(() => setSpotlightData([]));
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
  // Date filtering and text search are now handled SERVER-SIDE by /api/events/search.
  // Client-side filters that remain: venue multi-select, distance, shortcut pills,
  // artist-name filter, and sort order. These operate on the already-paginated
  // server response.
  const filteredEvents = useMemo(() => {
    let list = [...events];

    if (activeVenues.length > 0) list = list.filter(e => activeVenues.includes(e.venue));

    // Artist filter (separate from search — this is the dedicated artist name filter)
    if (artistSearch.trim()) {
      const aq = normalizeVenue(artistSearch);
      list = list.filter(e => normalizeVenue(e.name).includes(aq));
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

    // Shortcut pill filter — check both DB pills and hardcoded SHORTCUT_PILLS
    if (activeShortcut) {
      const pill = dbPills.find(p => p.id === activeShortcut) || SHORTCUT_PILLS.find(p => p.id === activeShortcut);
      if (pill) {
        const cfg = pill.filter_config || {};
        switch (pill.filter_type) {
          case 'trending': {
            const venueCounts = {};
            list.forEach(e => { venueCounts[e.venue] = (venueCounts[e.venue] || 0) + 1; });
            const counts = Object.values(venueCounts).sort((a, b) => b - a);
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
            if (cfg.after_hour) {
              list = list.filter(e => {
                if (!e.start_time) return false;
                const hr = parseInt(e.start_time.split(':')[0], 10);
                return hr >= cfg.after_hour;
              });
            }
            break;
          }
          case 'venue_tag': {
            const tags = (cfg.tags || []).map(t => t.toLowerCase());
            list = list.filter(e => {
              const vt = (e.venue_tags || []).map(t => t.toLowerCase());
              const vType = (e.venue_type || '').toLowerCase();
              return tags.some(t => vt.includes(t) || vType.includes(t));
            });
            break;
          }
          case 'vibes': {
            const vibes = (cfg.vibes || []).map(v => v.toLowerCase());
            list = list.filter(e => {
              const ev = (e.artist_vibes || []).map(v => v.toLowerCase());
              return vibes.some(v => ev.includes(v));
            });
            break;
          }
          case 'keyword': {
            const terms = (cfg.terms || []).map(s => s.toLowerCase());
            list = list.filter(e => {
              const title = (e.event_title || '').toLowerCase();
              const name = (e.name || '').toLowerCase();
              const desc = (e.description || '').toLowerCase();
              const category = (e.category || '').toLowerCase();
              return terms.some(s => title.includes(s) || name.includes(s) || desc.includes(s) || category.includes(s));
            });
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
  }, [events, activeVenues, artistSearch, milesRadius, locationCoords, activeShortcut, dbPills]);

  const groupedEvents = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

  const heroEvents = useMemo(() => {
    // Priority 1: Hydrated spotlight data from /api/spotlight
    if (spotlightData.length > 0) return spotlightData;

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
  }, [events, todayStr, spotlightData]);

  const heroIsToday = heroEvents.length > 0 && heroEvents[0]?.date === todayStr;

  // ── Stable callback for HeroSection slide changes (avoids re-renders) ──
  const handleHeroSlideChange = useCallback((active, total) => {
    setHeroSlide(prev => (prev.active === active && prev.total === total) ? prev : { active, total });
  }, []);

  // Venue list with event counts (for venue filter)
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

  const radiusIsOverridden = milesRadius !== profileRadiusRef.current;
  const hasActiveFilters = dateKey !== 'all' || radiusIsOverridden || searchQuery.trim() !== '' || activeShortcut !== null || activeVenues.length > 0;
  const activeFilterCount = [dateKey !== 'all', radiusIsOverridden, searchQuery.trim() !== '', activeShortcut !== null, activeVenues.length > 0].filter(Boolean).length;
  const clearAllFilters = useCallback(() => {
    setDateKey('all');
    setPickedDate('');
    setActiveVenues([]);
    setMilesRadius(null);               // truly clear — any distance
    setArtistSearch('');
    setSearchQuery('');
    setDebouncedSearch('');              // skip the 300ms debounce for immediate re-fetch
    // NOTE: does NOT close the panel — user stays in filter view to start over
    setActiveFilterCard(null);
    setVenueSearch('');
    setActiveShortcut(null);
    setShowCalendar(false);
  }, []);

  // Filter panel labels
  const whenLabel = dateKey === 'pick' && pickedDate
    ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : DATE_OPTIONS.find(o => o.key === dateKey)?.label || 'Any time';
  const venueLabel = activeVenues.length === 0 ? 'Any venue' : activeVenues.length === 1 ? activeVenues[0] : `${activeVenues.length} venues`;
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
    // Section-divider treatment: big enough that users notice the date
    // change on scroll but still quieter than card titles.
    fontSize: '17px', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '1px', color: darkMode ? '#D8D8F0' : '#1F2937',
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <>
      <div style={{ height: '100svh', display: 'flex', flexDirection: 'column', background: t.bg, maxWidth: '480px', margin: '0 auto', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>

        {/* ── Top Nav ────────────────────────────────────────────────────── */}
        <header onClick={() => { if (filtersExpanded) { setFiltersExpanded(false); setActiveFilterCard(null); } }} style={{
          position: 'sticky', top: 0, zIndex: filtersExpanded ? 115 : 100,
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

          {/* Omnibar pill — Fake search bar (div wrapper to avoid button-in-button hydration error) */}
          <div role="button" tabIndex={0} onClick={(e) => {
            e.stopPropagation();
            if (filtersExpanded) {
              setFiltersExpanded(false);
              setActiveFilterCard(null);
            } else {
              openSearch();
            }
          }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} style={{
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
                overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1,
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
                overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                transition: 'color 0.2s ease',
              }}>
                Search / Filters
              </span>
            )}
            {/* Active filter pills inline + passive radius indicator */}
            {(hasActiveFilters || milesRadius !== null) && (
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
                {milesRadius !== null && (() => {
                  const isOverride = milesRadius !== profileRadiusRef.current;
                  const clr = isOverride ? '#E8722A' : (darkMode ? 'rgba(255,255,255,0.35)' : '#9CA3AF');
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: isOverride ? 600 : 500, color: clr, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill={clr} /></svg>
                      {milesRadius}mi
                    </span>
                  );
                })()}
                {activeShortcut && (() => {
                  const pill = dbPills.find(p => p.id === activeShortcut) || SHORTCUT_PILLS.find(p => p.id === activeShortcut);
                  if (!pill) return null;
                  const iconPath = MATERIAL_ICON_PATHS[pill.icon_name] || MATERIAL_ICON_PATHS.label;
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: '#E8722A', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d={iconPath} fill="#E8722A" /></svg>
                      {pill.label}
                    </span>
                  );
                })()}
                {activeVenues.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: '#E8722A', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z" fill="#E8722A" /></svg>
                    {activeVenues.length === 1 ? activeVenues[0].length > 12 ? activeVenues[0].slice(0, 12) + '…' : activeVenues[0] : `${activeVenues.length} venues`}
                  </span>
                )}
              </div>
            )}
            {!hasActiveFilters && milesRadius === null && <div style={{ flex: 1 }} />}
            {/* Right: badge or tune icon */}
            {hasActiveFilters ? (<>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '2px',
                fontSize: '9px', fontWeight: 700, color: '#1C1917',
                background: t.accent, borderRadius: '8px',
                padding: '1px 5px', flexShrink: 0, lineHeight: '14px',
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill="#1C1917" /></svg>
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
                title="Reset filters"
              >
                <svg width="12" height="12" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={darkMode ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} /></svg>
              </button>
            </>) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill={darkMode ? 'rgba(255,255,255,0.5)' : '#6B7280'} />
              </svg>
            )}
          </div>
          </>}

          {/* Spacer — pushes bell to far right on tabs without omnibar */}
          {(activeTab === 'saved' || activeTab === 'profile') && <div style={{ flex: 1 }} />}

          {/* Right-side icon group — stays anchored to far right on all tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* Add to the Jar FAB — hidden on saved/profile tabs */}
            {activeTab !== 'saved' && activeTab !== 'profile' && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowSubmit(true); }}
                title="Add to the Jar"
                className="add-jar-btn"
                style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  border: `1px solid ${darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                  background: 'transparent',
                  cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s ease',
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill={darkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'} /></svg>
              </button>
            )}

            {/* Bell icon — notification center (all tabs, logged-in only) */}
            {isLoggedIn && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setNotifDrawerOpen(prev => !prev); }}
                  title="Notifications"
                  style={{
                    position: 'relative',
                    width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                    background: notifDrawerOpen ? t.accent : (darkMode ? '#2A2A3A' : '#E5E7EB'),
                    cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
                      fill={notifDrawerOpen ? 'white' : (darkMode ? '#CCCCDD' : '#4B5563')} />
                  </svg>
                  {/* Red unread badge */}
                  {unreadCount > 0 && (
                    <span style={{
                      position: 'absolute', top: '-3px', right: '-3px',
                      minWidth: '16px', height: '16px', borderRadius: '999px',
                      background: '#EF4444', color: 'white',
                      fontSize: '9px', fontWeight: 800, lineHeight: '16px', textAlign: 'center',
                      padding: '0 4px', border: `2px solid ${darkMode ? '#2A2A3A' : '#E5E7EB'}`,
                    }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Notification Popup (floating dropdown from bell) ──────────── */}
        {notifDrawerOpen && (
          <>
            <div onClick={() => setNotifDrawerOpen(false)} style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
            }} />
            <div style={{
              position: 'fixed', top: '56px', right: '8px', zIndex: 201,
              maxHeight: '70vh', overflowY: 'auto',
              background: t.surface,
              border: `1px solid ${darkMode ? '#2A2A3A' : '#E5E7EB'}`,
              boxShadow: darkMode
                ? '0 12px 48px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)'
                : '0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)',
              borderRadius: '12px',
              width: 'calc(100vw - 16px)', maxWidth: '380px',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px 8px', borderBottom: `1px solid ${t.borderLight}`,
              }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>Notifications</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {unreadCount > 0 && (
                    <button onClick={() => { markNotificationsRead(); }} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '12px', color: t.accent, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                    }}>Mark all read</button>
                  )}
                  {notifications.length > 0 && (
                    <button onClick={() => { clearAllNotifications(); }} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '12px', color: t.textMuted, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                    }}>Clear All</button>
                  )}
                </div>
              </div>

              {/* Notification list */}
              {notifications.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}>🔔</span>
                  <p style={{ fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>No notifications yet</p>
                  <p style={{ fontSize: '12px', color: t.textSubtle, fontFamily: "'DM Sans', sans-serif", marginTop: '4px' }}>
                    Follow artists to get alerts when new shows are added!
                  </p>
                </div>
              ) : (
                <div>
                  {notifications.slice(0, 20).map(notif => (
                    <div
                      key={notif.id}
                      style={{
                        position: 'relative',
                        display: 'flex', alignItems: 'stretch',
                        background: notif.is_read ? t.surface : (darkMode ? 'rgba(232,114,42,0.05)' : 'rgba(232,114,42,0.04)'),
                        borderBottom: `1px solid ${t.borderLight}`,
                      }}>
                      {/* Clickable notification body */}
                      <button
                        onClick={() => {
                          if (!notif.is_read) markSingleNotificationRead(notif.id);
                          setNotifDrawerOpen(false);
                          if (notif.target_url) {
                            const eventId = notif.target_url.replace('/events/', '');
                            if (eventId) {
                              setActiveTab('home');
                              setTimeout(() => {
                                const el = document.getElementById(`event-${eventId}`);
                                if (el) {
                                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  el.style.outline = '2px solid #E8722A';
                                  el.style.outlineOffset = '2px';
                                  el.style.borderRadius = '12px';
                                  setTimeout(() => { el.style.outline = 'none'; }, 2000);
                                }
                              }, 300);
                            }
                          }
                        }}
                        style={{
                          flex: 1, display: 'flex', flexDirection: 'column', gap: '2px',
                          padding: '12px 36px 12px 16px', border: 'none', cursor: 'pointer',
                          background: 'transparent', textAlign: 'left', minWidth: 0,
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {!notif.is_read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.accent, flexShrink: 0 }} />}
                          <span style={{
                            fontSize: '13px', fontWeight: notif.is_read ? 500 : 700,
                            color: t.text, fontFamily: "'DM Sans', sans-serif",
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{notif.title}</span>
                        </div>
                        {notif.body && (
                          <p style={{
                            fontSize: '12px', color: t.textMuted, margin: 0,
                            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
                            paddingLeft: notif.is_read ? '0' : '14px',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>{notif.body}</p>
                        )}
                        <span style={{
                          fontSize: '10px', color: t.textSubtle, fontFamily: "'DM Sans', sans-serif",
                          paddingLeft: notif.is_read ? '0' : '14px', marginTop: '2px',
                        }}>
                          {(() => {
                            const diff = Date.now() - new Date(notif.created_at).getTime();
                            const mins = Math.floor(diff / 60000);
                            if (mins < 1) return 'Just now';
                            if (mins < 60) return `${mins}m ago`;
                            const hrs = Math.floor(mins / 60);
                            if (hrs < 24) return `${hrs}h ago`;
                            return `${Math.floor(hrs / 24)}d ago`;
                          })()}
                        </span>
                      </button>
                      {/* Dismiss X button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                        title="Dismiss"
                        style={{
                          position: 'absolute', top: '10px', right: '10px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '22px', height: '22px', borderRadius: '50%',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: darkMode ? '#5A5A7A' : '#B0B0B0',
                          transition: 'color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = darkMode ? '#AAAACC' : '#6B7280'; e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = darkMode ? '#5A5A7A' : '#B0B0B0'; e.currentTarget.style.background = 'none'; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Filter Panel (overlay — fixed, slides down from header) ─── */}
        <div style={{
          position: 'fixed',
          top: 'calc(60px + env(safe-area-inset-top))',
          left: '50%',
          transform: filtersExpanded
            ? 'translateX(-50%) translateY(0)'
            : 'translateX(-50%) translateY(-10px)',
          width: '100%',
          maxWidth: '480px',
          boxSizing: 'border-box',
          zIndex: 120,
          opacity: filtersExpanded ? 1 : 0,
          visibility: filtersExpanded ? 'visible' : 'hidden',
          pointerEvents: filtersExpanded ? 'auto' : 'none',
          transition: filtersExpanded
            ? 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s'
            : 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s 0.25s',
          background: darkMode ? '#1A1A28' : '#F2F0ED',
          borderBottom: filtersExpanded ? `1px solid ${t.border}` : 'none',
          borderRadius: '0 0 16px 16px',
          boxShadow: filtersExpanded ? '0 12px 40px rgba(0,0,0,0.3)' : 'none',
          overflow: filtersExpanded ? 'visible' : 'hidden',
          maxHeight: filtersExpanded ? '80vh' : '0px',
        }}>
          {activeTab === 'home' && (
            <div style={{ padding: '6px 12px 8px' }}>
              <div style={{
                borderRadius: '12px', overflow: 'hidden',
                boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.08)',
                background: darkMode ? '#20202E' : '#F5F3F0',
              }}>
                {/* Search input + inline close button */}
                <div style={{
                  padding: '10px 14px',
                  borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  background: darkMode ? '#262636' : '#FFFFFF',
                  borderRadius: '12px 12px 0 0',
                }}>
                  {/* Search bar + Close X inline row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Search input + autocomplete wrapper */}
                    <div style={{ flex: 1, position: 'relative' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px', borderRadius: '10px',
                        border: `1px solid ${searchFocused ? (darkMode ? '#E8722A80' : '#E8722A') : (darkMode ? '#2E2E40' : '#DDD')}`,
                        background: darkMode ? '#22222E' : t.inputBg,
                        transition: 'border-color 0.2s',
                      }}>
                      {/* Material: search */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={darkMode ? 'rgba(255,255,255,0.5)' : '#6B7280'} />
                      </svg>
                      <input
                        ref={searchInputRef}
                        type="text"
                        enterKeyHint="search"
                        className={`filter-search-input${darkMode ? ' dark-mode' : ''}`}
                        placeholder="Search artists, events, etc."
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
                                d={
                                  s.type === 'venue'    ? MATERIAL_ICON_PATHS.location_on
                                : s.type === 'artist'   ? MATERIAL_ICON_PATHS.music_note
                                : s.type === 'festival' ? MATERIAL_ICON_PATHS.local_fire_department
                                : s.type === 'special'  ? MATERIAL_ICON_PATHS.restaurant
                                :                         MATERIAL_ICON_PATHS.calendar_month
                                }
                                fill={
                                  s.type === 'venue'    ? '#a78bfa'
                                : s.type === 'artist'   ? '#E8722A'
                                : s.type === 'festival' ? '#f59e0b'
                                : s.type === 'special'  ? '#ec4899'
                                :                         '#10b981'
                                }
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
                    {/* Close X — inline with search bar */}
                    <button onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, borderRadius: '50%',
                      transition: 'opacity 0.15s',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={darkMode ? '#9898B0' : '#6B7280'} /></svg>
                    </button>
                  </div>
                </div>

                {/* ── Shortcut Pills — horizontal scroll with gradient fade ────────── */}
                <div style={{ position: 'relative',
                  borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  background: darkMode ? '#262636' : '#FFFFFF',
                }}>
                  <div
                    className="shortcut-pills"
                    style={{
                      display: 'flex', overflowX: 'auto', gap: '8px',
                      padding: '8px 14px',
                      WebkitOverflowScrolling: 'touch',
                      scrollbarWidth: 'none', msOverflowStyle: 'none',
                    }}
                  >
                    {/* Shortcut pills — hardcoded list only, no DB merge */}
                    {SHORTCUT_PILLS.map(pill => {
                      const isActive = activeShortcut === pill.id;
                      const iconPath = MATERIAL_ICON_PATHS[pill.icon || pill.icon_name] || MATERIAL_ICON_PATHS.label;
                      return (
                        <button
                          key={pill.id}
                          onClick={() => setActiveShortcut(isActive ? null : pill.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '7px 14px', borderRadius: '20px',
                            border: isActive
                              ? '1.5px solid #E8722A'
                              : `1px solid ${darkMode ? 'rgba(255,255,255,0.18)' : '#D1D5DB'}`,
                            background: isActive
                              ? (darkMode ? 'rgba(232,114,42,0.15)' : '#FFF4ED')
                              : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                            color: isActive ? '#E8722A' : (darkMode ? '#B0B0C8' : '#4B5563'),
                            fontSize: '12px', fontWeight: isActive ? 700 : 500,
                            fontFamily: "'DM Sans', sans-serif",
                            whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: isActive
                              ? '0 0 10px rgba(232,114,42,0.5), 0 0 25px rgba(232,114,42,0.2), inset 0 0 8px rgba(232,114,42,0.15)'
                              : 'none',
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
                  {/* Right-side gradient fade to signal scrollable overflow */}
                  <div style={{
                    position: 'absolute', top: 0, right: 0, bottom: 0, width: '40px',
                    background: `linear-gradient(to right, transparent, ${darkMode ? '#262636' : '#FFFFFF'})`,
                    pointerEvents: 'none',
                  }} />
                </div>

                {/* 1. DATE card (Date Picker) */}
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
                    display: 'flex', alignItems: 'center', width: '100%', padding: '14px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px', minHeight: '44px',
                  }}>
                    {/* Material: calendar_month */}
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" fill={dateKey !== 'all' ? '#E8722A' : (darkMode ? '#A0A0BE' : '#374151')} /></svg>
                    <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: dateKey !== 'all' ? '#E8722A' : (darkMode ? '#A0A0BE' : '#374151'), lineHeight: 1 }}>Date</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: dateKey !== 'all' ? '#E8722A' : (darkMode ? '#8C8CA4' : '#6B7280'), lineHeight: 1, marginRight: '6px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{whenLabel}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, transform: activeFilterCard === 'when' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={dateKey !== 'all' ? '#E8722A' : (darkMode ? '#8C8CA4' : '#9CA3AF')} strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'when' && (
                    <div style={{ padding: '0 12px 8px 12px' }}>
                      {/* Row 1: Quick-select pills — forced single line */}
                      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '4px' }}>
                        {DATE_OPTIONS.filter(o => o.key !== 'pick').map(opt => (
                          <button key={opt.key} onClick={() => {
                            setDateKey(opt.key);
                            setPickedDate(''); setShowCalendar(false); setActiveFilterCard(null);
                          }} style={{
                            flex: 1, padding: '10px 6px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                            background: dateKey === opt.key ? '#E8722A' : (darkMode ? '#2A2A3C' : '#E8E6E2'),
                            color: dateKey === opt.key ? '#1C1917' : t.text,
                            fontSize: '13px', fontWeight: dateKey === opt.key ? 700 : 500,
                            fontFamily: "'DM Sans', sans-serif",
                            minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            whiteSpace: 'nowrap',
                          }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {/* Row 2: Custom calendar picker — replaces native <input type="date"> */}
                      {/* Toggle button */}
                      <button onClick={() => {
                        setShowCalendar(prev => {
                          if (!prev) setCalViewDate(pickedDate ? new Date(pickedDate + 'T12:00:00') : new Date());
                          return !prev;
                        });
                      }} style={{
                        width: '100%', padding: '10px 14px', borderRadius: '10px', marginTop: '6px',
                        background: dateKey === 'pick' ? (darkMode ? '#2A2A3C' : '#FFF7ED') : (darkMode ? '#2A2A3C' : '#E8E6E2'),
                        color: dateKey === 'pick' ? '#E8722A' : t.text,
                        border: dateKey === 'pick' ? '1.5px solid #E8722A' : '1.5px solid transparent',
                        fontSize: '14px', fontWeight: dateKey === 'pick' ? 700 : 500,
                        fontFamily: "'DM Sans', sans-serif",
                        minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        cursor: 'pointer',
                      }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="1" y="2.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                          <path d="M1 6.5h14" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M4.5 1v3M11.5 1v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        {dateKey === 'pick' && pickedDate
                          ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'Pick a Specific Date'}
                      </button>

                      {/* Inline calendar grid */}
                      {showCalendar && (() => {
                        const vYear = calViewDate.getFullYear();
                        const vMonth = calViewDate.getMonth();
                        const firstDay = new Date(vYear, vMonth, 1).getDay(); // 0=Sun
                        const daysInMonth = new Date(vYear, vMonth + 1, 0).getDate();
                        const today = new Date(); today.setHours(0,0,0,0);
                        const cells = [];
                        // Leading blanks for alignment
                        for (let i = 0; i < firstDay; i++) cells.push(null);
                        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                        const monthLabel = calViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        // Can't go before current month
                        const canPrev = vYear > today.getFullYear() || (vYear === today.getFullYear() && vMonth > today.getMonth());

                        return (
                          <div style={{
                            marginTop: '6px', borderRadius: '10px', overflow: 'hidden',
                            background: darkMode ? '#1E1E2E' : '#FFFFFF',
                            border: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
                          }}>
                            {/* Month nav header */}
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '6px 10px',
                              background: darkMode ? '#262636' : '#F9F9FB',
                              borderBottom: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
                            }}>
                              <button onClick={e => { e.preventDefault(); e.stopPropagation(); if (canPrev) setCalViewDate(new Date(vYear, vMonth - 1, 1)); }}
                                style={{ background: 'none', border: 'none', cursor: canPrev ? 'pointer' : 'default',
                                  padding: '4px 6px', borderRadius: '6px', opacity: canPrev ? 1 : 0.3,
                                  color: t.text, fontSize: '16px', lineHeight: 1, }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                              </button>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
                                {monthLabel}
                              </span>
                              <button onClick={e => { e.preventDefault(); e.stopPropagation(); setCalViewDate(new Date(vYear, vMonth + 1, 1)); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                  padding: '4px 6px', borderRadius: '6px',
                                  color: t.text, fontSize: '16px', lineHeight: 1, }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                              </button>
                            </div>
                            {/* Day-of-week headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '4px 6px 0', gap: '1px' }}>
                              {['S','M','T','W','T','F','S'].map((d, i) => (
                                <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 600,
                                  color: darkMode ? '#6B6B8A' : '#9CA3AF', padding: '1px 0',
                                  fontFamily: "'DM Sans', sans-serif" }}>{d}</div>
                              ))}
                            </div>
                            {/* Day cells */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '2px 6px 6px', gap: '1px' }}>
                              {cells.map((day, i) => {
                                if (day === null) return <div key={`blank-${i}`} />;
                                const cellDate = new Date(vYear, vMonth, day);
                                const cellStr = `${vYear}-${String(vMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                const isPast = cellDate < today;
                                const isToday = cellStr === todayStr;
                                const isSelected = cellStr === pickedDate;
                                return (
                                  <button key={cellStr}
                                    disabled={isPast}
                                    onClick={e => {
                                      e.preventDefault(); e.stopPropagation();
                                      setPickedDate(cellStr); setDateKey('pick');
                                      setShowCalendar(false); setActiveFilterCard(null);
                                    }}
                                    style={{
                                      width: '100%', height: '36px', borderRadius: '8px',
                                      border: isToday && !isSelected ? `1.5px solid ${darkMode ? '#555570' : '#CCCCCC'}` : isSelected ? '1.5px solid #E8722A' : '1.5px solid transparent',
                                      background: isSelected ? '#E8722A' : 'transparent',
                                      color: isSelected ? '#FFFFFF' : isPast ? (darkMode ? '#444460' : '#C0C0C0') : isToday ? '#E8722A' : t.text,
                                      fontWeight: isSelected || isToday ? 700 : 500,
                                      fontSize: '13px', fontFamily: "'DM Sans', sans-serif",
                                      cursor: isPast ? 'default' : 'pointer',
                                      opacity: isPast ? 0.4 : 1,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'background 0.1s, border-color 0.1s',
                                    }}>
                                    {day}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* 2. LOCATION card (Distance) */}
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
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'distance' ? null : 'distance')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '14px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px', minHeight: '44px',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill={locationCoords && milesRadius !== null ? '#E8722A' : (darkMode ? '#A0A0BE' : '#374151')} /></svg>
                    <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: locationCoords && milesRadius !== null ? '#E8722A' : (darkMode ? '#A0A0BE' : '#374151'), lineHeight: 1 }}>Location</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: locationCoords && milesRadius !== null ? '#E8722A' : (darkMode ? '#8C8CA4' : '#6B7280'), lineHeight: 1, marginRight: '6px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                      {locationCoords && milesRadius !== null ? `${locationLabel} + ${milesRadius} mi` : locationCoords ? locationLabel : 'Any distance'}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, transform: activeFilterCard === 'distance' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={locationCoords && milesRadius !== null ? '#E8722A' : (darkMode ? '#8C8CA4' : '#9CA3AF')} strokeWidth="1.5" fill="none" /></svg>
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
                        <input type="range" min="0" max="25" value={milesRadius ?? 0}
                          className="distance-slider"
                          disabled={!locationCoords}
                          onChange={e => { const v = parseInt(e.target.value); setMilesRadius(v === 0 ? null : v); }}
                          style={{
                            flex: 1, height: '6px',
                            background: `linear-gradient(to right, #E8722A ${((milesRadius ?? 0) / 25) * 100}%, ${darkMode ? '#3A3A4A' : '#DDD'} 0%)`,
                            borderRadius: '3px',
                          }}
                        />
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#A0A0A0', minWidth: '28px', textAlign: 'right', fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>25 mi</span>
                      </div>
                      {/* Current radius display + local reset */}
                      {milesRadius !== null && locationCoords && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '0 2px', fontFamily: "'DM Sans', sans-serif" }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#E8722A' }}>
                            {milesRadius} miles from {locationLabel}
                          </span>
                          {milesRadius !== profileRadiusRef.current && (
                            <button
                              className="reset-to-default-btn"
                              onClick={() => setMilesRadius(profileRadiusRef.current)}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: t.textMuted, fontFamily: "'DM Sans', sans-serif", transition: 'opacity 0.15s' }}
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              Reset to default
                            </button>
                          )}
                        </div>
                      )}
                      {milesRadius === null && profileRadiusRef.current !== null && locationCoords && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '0 2px', fontFamily: "'DM Sans', sans-serif" }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted }}>
                            Showing all distances
                          </span>
                          <button
                            className="reset-to-default-btn"
                            onClick={() => setMilesRadius(profileRadiusRef.current)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: t.textMuted, fontFamily: "'DM Sans', sans-serif", transition: 'opacity 0.15s' }}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Reset to default
                          </button>
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

                {/* 3. VENUE card (Searchable multi-select combobox) */}
                <div style={{
                  background: activeFilterCard === 'venue'
                    ? (darkMode ? '#2A1E14' : '#FFF8F3')
                    : (darkMode ? '#262636' : '#FFFFFF'),
                  border: activeFilterCard === 'venue'
                    ? `1.5px solid ${darkMode ? '#E8722A80' : '#E8722A'}`
                    : `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  borderRadius: activeFilterCard === 'venue' ? '10px' : '0',
                  margin: activeFilterCard === 'venue' ? '4px 6px' : '0',
                  transition: 'all 0.2s ease',
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'venue' ? null : 'venue')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '14px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px', minHeight: '44px',
                  }}>
                    {/* Material: storefront */}
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z" fill={activeVenues.length > 0 ? '#E8722A' : (darkMode ? '#A0A0BE' : '#374151')} /></svg>
                    <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: activeVenues.length > 0 ? '#E8722A' : (darkMode ? '#A0A0BE' : '#374151'), lineHeight: 1 }}>Venue</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: activeVenues.length > 0 ? '#E8722A' : (darkMode ? '#8C8CA4' : '#6B7280'), lineHeight: 1, marginRight: '6px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {venueLabel}
                    </span>
                    {activeVenues.length > 0 && (
                      <span style={{
                        background: '#E8722A', color: '#FFFFFF', fontSize: '10px', fontWeight: 700,
                        borderRadius: '8px', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
                        fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
                      }}>{activeVenues.length}</span>
                    )}
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, transform: activeFilterCard === 'venue' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={activeVenues.length > 0 ? '#E8722A' : (darkMode ? '#8C8CA4' : '#9CA3AF')} strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'venue' && (
                    <div style={{ padding: '0 12px 10px' }}>
                      {/* Venue search input */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', borderRadius: '8px', marginBottom: '8px',
                        border: `1px solid ${darkMode ? '#2E2E40' : '#DDD'}`,
                        background: darkMode ? '#22222E' : t.inputBg,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z" fill={t.textMuted} /></svg>
                        <input
                          type="text"
                          placeholder="Search venues..."
                          value={venueSearch}
                          onChange={e => setVenueSearch(e.target.value)}
                          style={{
                            flex: 1, border: 'none', background: 'transparent', outline: 'none',
                            fontSize: '14px', color: t.text, fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        {venueSearch && (
                          <button onClick={() => setVenueSearch('')} style={{
                            background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                            border: 'none', cursor: 'pointer',
                            width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="8" height="8" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={darkMode ? '#FFF' : '#666'} /></svg>
                          </button>
                        )}
                      </div>
                      {/* Selected venues chips */}
                      {activeVenues.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                          {activeVenues.map(v => (
                            <button key={v} onClick={() => setActiveVenues(prev => prev.filter(x => x !== v))} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '4px 10px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                              background: darkMode ? '#E8722A30' : '#FFF0E6',
                              fontSize: '12px', fontWeight: 600, color: '#E8722A',
                              fontFamily: "'DM Sans', sans-serif",
                            }}>
                              {v}
                              <svg width="8" height="8" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="#E8722A" /></svg>
                            </button>
                          ))}
                          <button onClick={() => setActiveVenues([])} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                            padding: '4px 8px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                            background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            fontSize: '11px', fontWeight: 600, color: t.textMuted,
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                            Clear
                          </button>
                        </div>
                      )}
                      {/* Scrollable checklist */}
                      <div style={{
                        maxHeight: '200px', overflowY: 'auto',
                        borderRadius: '8px',
                        border: `1px solid ${darkMode ? '#2E2E40' : '#E5E7EB'}`,
                        background: darkMode ? '#1E1E2C' : '#FAFAFA',
                      }}>
                        {filteredPanelVenues.length === 0 ? (
                          <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
                            {venueSearch.trim() ? 'No venues match your search' : 'No venues found'}
                          </div>
                        ) : (
                          filteredPanelVenues.map((v, i) => {
                            const isChecked = activeVenues.includes(v.name);
                            return (
                              <button
                                key={v.name}
                                onClick={() => {
                                  setActiveVenues(prev =>
                                    isChecked ? prev.filter(x => x !== v.name) : [...prev, v.name]
                                  );
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                                  padding: '9px 12px', background: isChecked ? (darkMode ? '#E8722A15' : '#FFF8F3') : 'transparent',
                                  border: 'none', cursor: 'pointer', textAlign: 'left',
                                  borderBottom: i < filteredPanelVenues.length - 1 ? `1px solid ${darkMode ? '#2A2A3A' : '#F0F0F0'}` : 'none',
                                  transition: 'background 0.1s',
                                }}
                              >
                                {/* Checkbox */}
                                <div style={{
                                  width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                                  border: isChecked ? '2px solid #E8722A' : `2px solid ${darkMode ? '#4A4A5A' : '#CCC'}`,
                                  background: isChecked ? '#E8722A' : 'transparent',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all 0.15s',
                                }}>
                                  {isChecked && (
                                    <svg width="10" height="10" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#FFF" /></svg>
                                  )}
                                </div>
                                {/* Venue name */}
                                <span style={{
                                  flex: 1, fontSize: '13px', fontWeight: isChecked ? 700 : 500,
                                  color: isChecked ? '#E8722A' : t.text,
                                  fontFamily: "'DM Sans', sans-serif",
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{v.name}</span>
                                {/* Event count badge */}
                                <span style={{
                                  fontSize: '11px', fontWeight: 600,
                                  color: darkMode ? '#6B6B8A' : '#9CA3AF',
                                  fontFamily: "'DM Sans', sans-serif",
                                }}>{v.count}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                      {/* Result count footer */}
                      {venueSearch.trim() && filteredPanelVenues.length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
                          {filteredPanelVenues.length} of {venueListWithCounts.length} venues
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer — Reset Filters (secondary) + Show events (primary) */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', background: darkMode ? '#262636' : '#FFFFFF',
                  borderTop: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
                  borderRadius: '0 0 12px 12px',
                }}>
                  {/* Reset Filters — subtle outline, hugs content */}
                  <button onClick={clearAllFilters} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    padding: '10px 14px', borderRadius: '10px',
                    background: darkMode ? 'transparent' : '#FFFFFF',
                    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : '#D1D5DB'}`,
                    cursor: 'pointer',
                    fontSize: '13px', fontWeight: 500,
                    color: darkMode ? '#9090A8' : '#6B7280',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'background 0.15s ease',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    minHeight: '44px',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor" />
                    </svg>
                    Reset Filters
                  </button>
                  {/* Show events — primary CTA, takes remaining space */}
                  <button onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }} style={{
                    flex: 1, padding: '10px 24px', borderRadius: '10px', border: 'none',
                    background: t.accent, color: '#1C1917', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                    minHeight: '44px',
                  }}>
                    Show {filteredEvents.length} events
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scrim overlay when filter panel is open — dims content, click to close */}
        {filtersExpanded && (
          <div
            onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 110,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />
        )}

        {/* ── Hero moved INSIDE scroll container (see below) ── */}

        {/* ── Saved view (Phase 2: Segmented — Saved Events | Following) ── */}
        {activeTab === 'saved' && (
          <div
            onTouchStart={handleSavedTouchStart}
            onTouchEnd={handleSavedTouchEnd}
            style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg, touchAction: 'pan-y' }}
          >
            {/* Segmented control toggle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '24px' }}>
              <div style={{
                position: 'relative',
                display: 'flex',
                width: '90%',
                maxWidth: '400px',
                background: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
                borderRadius: '100px',
                padding: '4px',
              }}>
                {/* Sliding orange pill */}
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  left: savedSegment === 'events' ? '4px' : '50%',
                  width: 'calc(50% - 4px)',
                  height: 'calc(100% - 8px)',
                  background: '#E8722A',
                  borderRadius: '100px',
                  transition: 'left 250ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                  boxShadow: '0 4px 15px rgba(255, 100, 0, 0.3)',
                }} />
                {[
                  { key: 'events', label: 'My Stubs' },
                  { key: 'following', label: 'My Locals' },
                ].map(seg => (
                  <button key={seg.key} onClick={() => handleSetSavedSegment(seg.key)} style={{
                    position: 'relative',
                    zIndex: 1,
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '10px 0',
                    color: savedSegment === seg.key
                      ? '#1C1917'
                      : darkMode ? 'rgba(255,255,255,0.85)' : '#4B5563',
                    fontSize: '16px',
                    fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'color 200ms ease',
                    letterSpacing: '0.3px',
                  }}>
                    {seg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content area — swipe handled by outer scroll container */}
            <div style={{ flex: 1, transition: 'opacity 0.2s ease' }}>

            {/* View A: Saved Events */}
            {savedSegment === 'events' && (() => {
                  let savedEvents = events.filter(e => favorites.has(e.id));
                  const now = new Date();

                  // Split by upcoming vs past using 6 AM rollover rule
                  if (savedTimeView === 'upcoming') {
                    // Keep event visible until 6 AM the morning after
                    savedEvents = savedEvents.filter(e => {
                      if (!e.date) return true;
                      const eventDate = new Date(e.date.substring(0, 10) + 'T06:00:00');
                      eventDate.setDate(eventDate.getDate() + 1);
                      return now < eventDate;
                    });
                  } else {
                    // Past: events whose next-morning 6 AM has passed
                    savedEvents = savedEvents.filter(e => {
                      if (!e.date) return false;
                      const eventDate = new Date(e.date.substring(0, 10) + 'T06:00:00');
                      eventDate.setDate(eventDate.getDate() + 1);
                      return now >= eventDate;
                    });
                  }

                  if (searchQuery.trim()) {
                    const q = normalizeVenue(searchQuery);
                    savedEvents = savedEvents.filter(e =>
                      normalizeVenue(e.name).includes(q) ||
                      normalizeVenue(e.venue).includes(q) ||
                      normalizeVenue(e.genre ?? '').includes(q)
                    );
                  }

                  // Upcoming: closest date first; Past: most recent first
                  savedEvents = savedEvents.sort((a, b) => {
                    const dc = savedTimeView === 'past'
                      ? b.date.localeCompare(a.date)
                      : a.date.localeCompare(b.date);
                    if (dc !== 0) return dc;
                    const aR = a.start_time && a.start_time !== '00:00';
                    const bR = b.start_time && b.start_time !== '00:00';
                    if (aR && !bR) return -1;
                    if (!aR && bR) return 1;
                    return savedTimeView === 'past'
                      ? (b.start_time ?? '').localeCompare(a.start_time ?? '')
                      : (a.start_time ?? '').localeCompare(b.start_time ?? '');
                  });

                  const hasAnySaved = events.some(e => favorites.has(e.id));

                  // Logged-out empty state — hard gate with friendly CTA (no toggle needed)
                  if (!isLoggedIn && savedEvents.length === 0) {
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
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
                          background: t.accent, color: '#1C1917', fontWeight: 700, fontSize: '15px',
                          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                          boxShadow: '0 2px 12px rgba(232,114,42,0.3)',
                        }}>
                          Sign In
                        </button>
                      </div>
                    );
                  }

                  const savedGroups = savedEvents.length > 0 ? groupEventsByDate(savedEvents) : [];
                  return (
                    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {/* Sub-header: count + Upcoming/Past toggle — ALWAYS visible */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 2px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                          {savedEvents.length} {savedTimeView === 'past' ? 'past' : 'saved'} event{savedEvents.length !== 1 ? 's' : ''}
                        </p>
                        <button
                          onClick={() => setSavedTimeView(v => v === 'upcoming' ? 'past' : 'upcoming')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            background: 'none', border: `1px solid ${darkMode ? '#3A3A4A' : '#D1D5DB'}`,
                            borderRadius: '8px', padding: '4px 10px', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 600,
                            color: darkMode ? '#AAAACC' : '#4B5563',
                            fontFamily: "'DM Sans', sans-serif",
                            transition: 'border-color 0.15s',
                          }}
                        >
                          {savedTimeView === 'upcoming' ? 'Upcoming' : 'Past'}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
                            <path d="M7 10l5 5 5-5z" fill="currentColor" />
                          </svg>
                        </button>
                      </div>

                      {/* Empty states (toggle still visible above) */}
                      {savedEvents.length === 0 && savedTimeView === 'past' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 32px', textAlign: 'center' }}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '14px' }}>
                            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" fill={t.textMuted} />
                          </svg>
                          <p style={{ fontWeight: 700, fontSize: '16px', color: t.text, marginBottom: '4px', fontFamily: "'DM Sans', sans-serif" }}>
                            No past shows yet
                          </p>
                          <p style={{ fontSize: '14px', color: t.textMuted, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>
                            Your gig history will live here. Go save some shows!
                          </p>
                        </div>
                      )}
                      {savedEvents.length === 0 && savedTimeView === 'upcoming' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 32px', textAlign: 'center' }}>
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
                      )}

                      {/* Event list */}
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
                                onFollowArtist={handleFollowArtist}
                                isArtistFollowed={followedArtistNames.has(event.name || event.artist_name || '')}
                                onFlag={handleFlag}
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
            </div>{/* end swipe wrapper */}
          </div>
        )}

        {/* ── Profile view ─────────────────────────────────────────────── */}
        {activeTab === 'profile' && (() => {
          /* ── Shared styles for grouped-list sections ── */
          const sectionCard = {
            margin: '0 16px 20px',
            borderRadius: '12px',
            background: t.surface,
            overflow: 'hidden',
            boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.4)' : '0 1px 6px rgba(0,0,0,0.07)',
            border: `1px solid ${t.border}`,
          };
          const sectionLabel = {
            fontSize: '11px', fontWeight: 700, color: t.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.8px',
            padding: '0 20px 8px', fontFamily: "'DM Sans', sans-serif",
          };
          const rowBase = (isLast) => ({
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '14px 16px', border: 'none', cursor: 'pointer',
            background: t.surface,
            borderBottom: isLast ? 'none' : `1px solid ${t.borderLight}`,
            fontFamily: "'DM Sans', sans-serif",
          });
          const rowLabel = (danger) => ({
            display: 'flex', alignItems: 'center', gap: '12px',
            fontSize: '14px', color: danger ? '#EF4444' : t.text, fontWeight: 500,
          });
          const chevron = <span style={{ color: t.textMuted, fontSize: '16px', fontWeight: 300 }}>›</span>;
          const toggleSwitch = (on) => (
            <div style={{ width: '44px', height: '24px', borderRadius: '999px', position: 'relative', background: on ? t.accent : t.textSubtle, transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: '3px', left: on ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </div>
          );

          return (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg }}>

            {/* ── Section 1: User Header ── */}
            <div style={{ padding: '32px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              {/* Avatar */}
              <div style={{
                position: 'relative', width: '80px', height: '80px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #E8722A, #3AADA0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px',
                cursor: isLoggedIn ? 'pointer' : 'default',
              }}>
                {isLoggedIn && user?.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
                  : <span style={{ lineHeight: 1 }}>👤</span>
                }
                {/* Camera badge for tappable hint */}
                {isLoggedIn && (
                  <div style={{
                    position: 'absolute', bottom: '-2px', right: '-2px',
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: t.accent, border: `3px solid ${t.bg}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" fill="#1C1917"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" fill="#1C1917"/></svg>
                  </div>
                )}
              </div>

              {isLoggedIn ? (
                <>
                  <p style={{ fontWeight: 700, fontSize: '20px', color: t.text, marginTop: '10px', fontFamily: "'DM Sans', sans-serif" }}>
                    {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Your Profile'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                    <p style={{ fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{user?.email}</p>
                    {(() => {
                      const provider = user?.app_metadata?.provider || (user?.app_metadata?.providers || [])[0] || 'email';
                      if (provider === 'google') return (
                        <svg width="14" height="14" viewBox="0 0 18 18" style={{ flexShrink: 0, opacity: 0.5 }}>
                          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                        </svg>
                      );
                      if (provider === 'apple') return (
                        <svg width="12" height="14" viewBox="0 0 16 20" fill={darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'} style={{ flexShrink: 0 }}>
                          <path d="M13.545 10.239c-.022-2.233 1.823-3.305 1.905-3.356-.037-.054-1.495-2.171-3.822-2.171-1.627 0-2.91.973-3.694.973-.804 0-2.005-.948-3.316-.923C2.757 4.789.935 5.887.935 8.574c0 2.842 2.04 7.294 3.682 7.294.966-.024 1.826-.693 2.614-.693.773 0 1.566.693 2.646.67 1.078-.024 1.95-.979 2.89-2.927.568-1.105.798-2.168.817-2.222-.018-.008-2.054-.816-2.039-3.457z"/>
                          <path d="M11.152 3.294c.686-.857 1.154-2.025 1.025-3.211-.99.043-2.217.695-2.926 1.529-.633.74-1.198 1.948-1.05 3.09 1.112.087 2.254-.568 2.951-1.408z"/>
                        </svg>
                      );
                      // Default: email/magic link — envelope icon
                      return (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill={darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'} />
                        </svg>
                      );
                    })()}
                  </div>
                  <button onClick={() => {
                    setEditDisplayName(user?.user_metadata?.full_name || user?.email?.split('@')[0] || '');
                    setEditAvatarUrl(user?.user_metadata?.avatar_url || '');
                    setEditEmail(user?.email || '');
                    setEmailChangeNote(null);
                    setShowEditProfile(true);
                  }} style={{
                    marginTop: '10px', padding: '8px 24px', borderRadius: '999px',
                    border: `1px solid ${t.border}`, background: 'transparent',
                    color: t.text, fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Edit Profile
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontWeight: 700, fontSize: '20px', color: t.text, marginTop: '10px', fontFamily: "'DM Sans', sans-serif" }}>Your Profile</p>
                  <p style={{ fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>Sign in to save events across devices</p>
                  <button onClick={() => openAuth('profile')} style={{
                    marginTop: '10px', padding: '10px 32px', borderRadius: '999px', border: 'none',
                    background: t.accent, color: '#1C1917', fontWeight: 700, fontSize: '14px',
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Sign In
                  </button>
                </>
              )}
            </div>

            {/* ── Material icon helper (with container) ── */}
            {(() => {
              const iconBox = { width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
              const mIcon = (name, color) => (
                <span style={iconBox}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d={MATERIAL_ICON_PATHS[name] || ''} fill={color || t.text} />
                  </svg>
                </span>
              );
              return (<>

            {/* ── Section 2: Display & Discovery ── */}
            <p style={sectionLabel}>Display & Discovery</p>
            <div style={sectionCard}>
              <button onClick={toggleDarkMode} style={rowBase(false)}>
                <span style={rowLabel(false)}>{mIcon('dark_mode')}Dark Mode</span>
                {toggleSwitch(darkMode)}
              </button>
              <button onClick={() => setShowRadiusPicker(true)} style={rowBase(true)}>
                <span style={rowLabel(false)}>{mIcon('location_on')}Search Radius</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: t.textMuted, fontSize: '13px', fontWeight: 500 }}>
                  {milesRadius === null ? 'Show All' : `${milesRadius} mi`} {chevron}
                </span>
              </button>
            </div>

            {/* ── Section 3: Alerts & Notifications ── */}
            <p style={sectionLabel}>Alerts & Notifications</p>
            <div style={sectionCard}>
              {/* Email Notifications — with subtitle */}
              <button onClick={() => toggleNotifPref('email')} style={{ ...rowBase(false), padding: '12px 16px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  {mIcon('mail')}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: t.text }}>Email Notifications</span>
                    <span style={{ fontSize: '11px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>Reminders sent directly to your inbox.</span>
                  </span>
                </span>
                {toggleSwitch(emailNotifPref)}
              </button>
              {/* In-App Alerts — with subtitle */}
              <button onClick={() => toggleNotifPref('inapp')} style={{ ...rowBase(false), padding: '12px 16px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  {mIcon('notifications_active')}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: t.text }}>In-App Alerts</span>
                    <span style={{ fontSize: '11px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>Silent alerts sent to your notifications tab.</span>
                  </span>
                </span>
                {toggleSwitch(inAppNotifPref)}
              </button>
              {/* The Local Lineup — disabled teaser row (same flex structure as above) */}
              <div style={{ ...rowBase(true), cursor: 'default', padding: '12px 16px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  {mIcon('calendar_month', '#888888')}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#888888', fontFamily: "'DM Sans', sans-serif" }}>The Local Lineup</span>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px',
                        color: '#E8722A', background: 'rgba(255, 100, 0, 0.15)',
                        padding: '2px 8px', borderRadius: '999px',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>COMING SOON</span>
                    </span>
                    <span style={{ fontSize: '11px', color: '#888888', fontFamily: "'DM Sans', sans-serif" }}>A Thursday preview of the weekend's best local shows.</span>
                  </span>
                </span>
                <div style={{ width: '44px', height: '24px', borderRadius: '999px', position: 'relative', background: darkMode ? '#333' : '#D1D5DB', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '3px', left: '3px', width: '18px', height: '18px', borderRadius: '50%', background: darkMode ? '#555' : '#F3F4F6', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }} />
                </div>
              </div>
            </div>

            {/* ── Section 4: Support & Business ── */}
            <p style={sectionLabel}>Support</p>
            <div style={sectionCard}>
              <button onClick={() => setShowSupport(true)} style={rowBase(false)}>
                <span style={rowLabel(false)}>{mIcon('help_outline')}Help & Feedback</span>
                {chevron}
              </button>
              <button onClick={() => window.open('/terms', '_blank')} style={rowBase(false)}>
                <span style={rowLabel(false)}>{mIcon('policy')}Terms & Privacy</span>
                {chevron}
              </button>
              {/* App Version */}
              <div style={{
                ...rowBase(true), cursor: 'default', justifyContent: 'center',
                padding: '10px 16px',
              }}>
                <span style={{ fontSize: '12px', color: t.textSubtle, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>
                  myLocalJam Web v1.0
                </span>
              </div>
            </div>

            {/* ── Section 6: Log Out ── */}
            {isLoggedIn && (
              <div style={{ margin: '4px 16px 32px' }}>
                <button onClick={handleSignOut} style={{
                  width: '100%', padding: '14px', borderRadius: '12px',
                  border: 'none', background: t.surface, cursor: 'pointer',
                  fontSize: '15px', fontWeight: 600, color: '#EF4444',
                  fontFamily: "'DM Sans', sans-serif",
                  boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.4)' : '0 1px 6px rgba(0,0,0,0.07)',
                  borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
                }}>
                  Log Out
                </button>
              </div>
            )}

              </>);
            })()}

          </div>
          );
        })()}

        {/* ── Event list (home tab) ─────────────────────────────────────── */}
        {activeTab === 'home' && (
          <div ref={homeScrollRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg, WebkitOverflowScrolling: 'touch' }}>
            {/* ── Hero (inside scroll container) — IntersectionObserver drives collapse ── */}
            {/* HeroPiston uses a sentinel + sticky positioning. No scrollRef needed. */}
            {!hasActiveFilters && (
              <div style={{ position: 'relative' }}>
                <HeroPiston>
                  <HeroSection
                    ref={heroRef}
                    events={heroEvents}
                    isToday={heroIsToday}
                    onArtistTap={setSpotlightEvent}
                    onSlideChange={handleHeroSlideChange}
                  />
                </HeroPiston>

                {/* ── Pagination dots — rendered OUTSIDE HeroPiston's clipping chain ── */}
                {heroSlide.total > 1 && (
                  <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '20px',
                    display: 'flex',
                    gap: '5px',
                    zIndex: 50,
                    pointerEvents: 'none',
                  }}>
                    {Array.from({ length: heroSlide.total }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => heroRef.current?.goToSlide(i)}
                        style={{
                          height: '7px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          pointerEvents: 'auto',
                          width: i === heroSlide.active ? '18px' : '7px',
                          background: i === heroSlide.active ? '#E8722A' : 'rgba(255,255,255,0.4)',
                          transition: 'all 0.3s',
                          WebkitTapHighlightColor: 'transparent',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
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
                    <div data-date-header={group.date} style={{
                      position: 'sticky', top: 0, zIndex: 50,
                      padding: '16px 0 8px',
                      background: t.bg,
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                      <span style={dateSeparatorStyle}>{group.label}</span>
                      {/* Calendar pick-a-date button: opens the same custom
                          calendar grid used by the "Date" filter card (via a
                          bottom-sheet modal rendered once at page level). The
                          previous implementation used a hidden <input
                          type="date"> overlay, which on iOS Safari would
                          auto-select the focused date on first tap and then
                          dismiss — "knocking the user out" before they could
                          actually choose. */}
                      <button
                        onClick={e => {
                          e.preventDefault(); e.stopPropagation();
                          // Jump the month view to the currently-picked date
                          // (or today) so the modal opens on a useful month.
                          setCalViewDate(pickedDate ? new Date(pickedDate + 'T12:00:00') : new Date());
                          // Anchor the popup directly below whichever date-group
                          // header was clicked. We measure the full sticky row
                          // (not just the icon) so the popup sits flush under
                          // the entire "TOMORROW · FRI, APR 24" line. The
                          // popup's max-height clamp keeps it from running off
                          // screen when the user clicks a later-date header
                          // lower in the list.
                          const headerEl = e.currentTarget.closest('[data-date-header]');
                          const rect = (headerEl || e.currentTarget).getBoundingClientRect();
                          setCalAnchorTop(Math.max(8, rect.bottom + 6));
                          setShowHeaderCalendar(true);
                        }}
                        aria-label="Pick a date"
                        title="Pick a date"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center',
                          width: '28px', height: '28px', flexShrink: 0,
                          color: darkMode ? '#A0A0BE' : '#6B7280',
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', padding: 0,
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <rect x="1" y="2.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                          <path d="M1 6.5h14" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M4.5 1v3M11.5 1v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {group.events.map((event, i) => (
                        <EventCardV2
                          key={event.id ?? `${group.date}-${i}`}
                          event={event}
                          isFavorited={favorites.has(event.id)}
                          onToggleFavorite={toggleFavorite}
                          darkMode={darkMode}
                          onFollowArtist={handleFollowArtist}
                          isArtistFollowed={followedArtistNames.has(event.name || event.artist_name || '')}
                          onFlag={handleFlag}
                          autoExpand={deepLinkEventId === event.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* ── Infinite scroll sentinel + loading indicator ──────── */}
                {loadingMore && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: t.textMuted, fontSize: '14px' }}>
                    Loading more events…
                  </div>
                )}
                {!hasMore && events.length > 0 && !loading && (
                  <div style={{ textAlign: 'center', padding: '24px 0 32px', color: t.textSubtle, fontSize: '13px' }}>
                    Showing all {totalEvents} events
                  </div>
                )}
                {/* Invisible sentinel — IntersectionObserver triggers loadMore when this enters the viewport */}
                <div ref={sentinelCallbackRef} style={{ height: '1px' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Header Calendar Popup (anchored dropdown) ────────────────────
          Same custom calendar grid that lives in the Date filter card,
          opened by the small calendar icon next to each sticky date header.
          Replaces the old native <input type="date"> overlay (which iOS
          Safari would auto-fire + dismiss on first tap). Positioned directly
          below whichever date header triggered it (calAnchorTop), with a
          clamp in the style calc to keep the full popup on-screen even when
          a late-in-list date header is tapped — popup height estimates to
          ~430px so we clamp anchorY to leave at least that much room above
          the bottom nav (~80px reserved). */}
      {showHeaderCalendar && (() => {
        const vYear = calViewDate.getFullYear();
        const vMonth = calViewDate.getMonth();
        const firstDay = new Date(vYear, vMonth, 1).getDay();
        const daysInMonth = new Date(vYear, vMonth + 1, 0).getDate();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        const monthLabel = calViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const canPrev = vYear > today.getFullYear() || (vYear === today.getFullYear() && vMonth > today.getMonth());

        // Clamp the anchor so the popup never overflows the viewport's bottom
        // area (reserve ~480px for popup + bottom nav + margin). If
        // calAnchorTop is null (e.g. opened via keyboard without a rect),
        // fall back to 80px which puts it just below the top header.
        const POPUP_RESERVE = 480;
        const anchorY = calAnchorTop ?? 80;
        const maxTop = typeof window !== 'undefined'
          ? Math.max(8, window.innerHeight - POPUP_RESERVE)
          : anchorY;
        const popupTop = Math.min(anchorY, maxTop);

        return (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setShowHeaderCalendar(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
              }}
            />
            {/* Popup */}
            <div style={{
              position: 'fixed', top: popupTop, left: '50%', transform: 'translateX(-50%)',
              width: 'calc(100% - 24px)', maxWidth: '360px', zIndex: 201,
              background: t.bg,
              borderRadius: '14px',
              padding: '12px',
              boxShadow: darkMode
                ? '0 8px 28px rgba(0,0,0,0.55)'
                : '0 8px 24px rgba(0,0,0,0.18)',
              border: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
            }}>
              {/* Popup header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 4px 10px',
              }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
                  Pick a Date
                </span>
                <button
                  onClick={() => setShowHeaderCalendar(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: t.textMuted, fontSize: '14px', fontWeight: 600,
                    padding: '6px 10px', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Close
                </button>
              </div>

              {/* Calendar grid (same structure as the filter card) */}
              <div style={{
                borderRadius: '10px', overflow: 'hidden',
                background: darkMode ? '#1E1E2E' : '#FFFFFF',
                border: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
              }}>
                {/* Month nav */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: darkMode ? '#262636' : '#F9F9FB',
                  borderBottom: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
                }}>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); if (canPrev) setCalViewDate(new Date(vYear, vMonth - 1, 1)); }}
                    style={{
                      background: 'none', border: 'none', cursor: canPrev ? 'pointer' : 'default',
                      padding: '6px 8px', borderRadius: '6px', opacity: canPrev ? 1 : 0.3,
                      color: t.text, lineHeight: 1,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
                    {monthLabel}
                  </span>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setCalViewDate(new Date(vYear, vMonth + 1, 1)); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '6px 8px', borderRadius: '6px',
                      color: t.text, lineHeight: 1,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                {/* DOW headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '6px 8px 0', gap: '2px' }}>
                  {['S','M','T','W','T','F','S'].map((d, i) => (
                    <div key={i} style={{
                      textAlign: 'center', fontSize: '11px', fontWeight: 600,
                      color: darkMode ? '#6B6B8A' : '#9CA3AF', padding: '2px 0',
                      fontFamily: "'DM Sans', sans-serif",
                    }}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '4px 8px 8px', gap: '2px' }}>
                  {cells.map((day, i) => {
                    if (day === null) return <div key={`blank-${i}`} />;
                    const cellDate = new Date(vYear, vMonth, day);
                    const cellStr = `${vYear}-${String(vMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isPast = cellDate < today;
                    const isToday = cellStr === todayStr;
                    const isSelected = cellStr === pickedDate;
                    return (
                      <button
                        key={cellStr}
                        disabled={isPast}
                        onClick={e => {
                          e.preventDefault(); e.stopPropagation();
                          setPickedDate(cellStr);
                          setDateKey('pick');
                          setShowHeaderCalendar(false);
                        }}
                        style={{
                          width: '100%', height: '40px', borderRadius: '8px',
                          border: isToday && !isSelected
                            ? `1.5px solid ${darkMode ? '#555570' : '#CCCCCC'}`
                            : isSelected ? '1.5px solid #E8722A' : '1.5px solid transparent',
                          background: isSelected ? '#E8722A' : 'transparent',
                          color: isSelected ? '#FFFFFF' : isPast ? (darkMode ? '#444460' : '#C0C0C0') : isToday ? '#E8722A' : t.text,
                          fontWeight: isSelected || isToday ? 700 : 500,
                          fontSize: '14px', fontFamily: "'DM Sans', sans-serif",
                          cursor: isPast ? 'default' : 'pointer',
                          opacity: isPast ? 0.4 : 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.1s, border-color 0.1s',
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: 'translateX(-50%)',
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
              // Already on Home — reset everything: scroll top, blur keyboard, clear search, collapse omnibar, clear filters, re-fetch
              homeScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              document.activeElement?.blur();
              clearAllFilters();
              fetchEvents(1, false); // force fresh pull even if dateKey was already 'all'
            } else if ((tab.key === 'saved' || tab.key === 'profile') && activeTab === tab.key) {
              // Already on My Jam or Profile — bounce back to Home
              setActiveTab('home');
            } else {
              if (tab.key === 'saved') handleSetSavedSegment('events');
              setActiveTab(tab.key);
            }
          }} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 16px',
            color: (tab.key === 'search'
              ? (searchFocused || (activeTab === 'home' && filtersExpanded))
              : tab.key === 'home'
                ? (activeTab === 'home' && !filtersExpanded && !searchFocused)
                : activeTab === tab.key
            ) ? t.accent : t.textMuted,
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
                /* Ticket stub — matches save button metaphor */
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M22 10V6a2 2 0 00-2-2H4a2 2 0 00-2 2v4a2 2 0 100 4v4a2 2 0 002 2h16a2 2 0 002-2v-4a2 2 0 100-4z" fill="currentColor" /></svg>
              )}
              {tab.key === 'profile' && (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor" /></svg>
              )}
            </span>
            <span style={{ fontSize: '10px', fontWeight: (tab.key === 'search'
              ? (searchFocused || (activeTab === 'home' && filtersExpanded))
              : tab.key === 'home'
                ? (activeTab === 'home' && !filtersExpanded && !searchFocused)
                : activeTab === tab.key
            ) ? 700 : 500 }}>{tab.label}</span>
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
      {showSupport && (
        <SupportModal darkMode={darkMode} onClose={() => setShowSupport(false)} userEmail={user?.email || null} />
      )}

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

      {/* ── Beta Welcome Overlay (first-visit only, localStorage-gated) ── */}
      <BetaWelcome />

      {/* ── Artist Spotlight Overlay (detached from HeroSection, z-9000) ── */}
      <ArtistSpotlight event={spotlightEvent} onClose={() => setSpotlightEvent(null)} darkMode={darkMode} />

      {/* ── Auth Modal ──────────────────────────────────────────────────── */}
      {showAuthModal && (
        <AuthModal
          darkMode={darkMode}
          trigger={authTrigger}
          onClose={() => { setShowAuthModal(false); setAuthTrigger(null); }}
        />
      )}

      {/* Follow upsell now rendered inline in EventCardV2 */}

      {/* ── Search Radius Picker ─────────────────────────────────────────── */}
      {showRadiusPicker && (
        <div
          onClick={() => setShowRadiusPicker(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '420px',
              background: t.surface, borderRadius: '20px 20px 0 0',
              border: `1px solid ${t.border}`, borderBottom: 'none',
              boxShadow: darkMode ? '0 -8px 40px rgba(0,0,0,0.5)' : '0 -4px 24px rgba(0,0,0,0.12)',
              fontFamily: "'DM Sans', sans-serif",
              padding: '24px 20px 32px',
            }}
          >
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.textSubtle }} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: t.text, margin: '0 0 4px', textAlign: 'center' }}>
              Search Radius
            </h3>
            <p style={{ fontSize: '12px', color: t.textMuted, margin: '0 0 20px', textAlign: 'center' }}>
              How far should we look for shows?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { value: 2, label: '2 miles' },
                { value: 5, label: '5 miles' },
                { value: 10, label: '10 miles' },
                { value: 25, label: '25 miles' },
                { value: null, label: 'Show All' },
              ].map(opt => {
                const isActive = milesRadius === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    onClick={async () => {
                      setMilesRadius(opt.value);
                      profileRadiusRef.current = opt.value; // update the base default
                      setShowRadiusPicker(false);
                      // Persist to Supabase if logged in
                      if (isLoggedIn) {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (session) {
                            await fetch('/api/notification-prefs', {
                              method: 'PATCH',
                              headers: {
                                Authorization: `Bearer ${session.access_token}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ search_radius: opt.value }),
                            });
                          }
                        } catch {}
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '14px 16px', borderRadius: '12px',
                      border: isActive ? '1.5px solid #E8722A' : `1px solid ${t.border}`,
                      background: isActive
                        ? (darkMode ? 'rgba(232,114,42,0.1)' : 'rgba(232,114,42,0.06)')
                        : t.surface,
                      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <span style={{
                      fontSize: '14px', fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#E8722A' : t.text,
                    }}>
                      {opt.label}
                    </span>
                    {isActive && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#E8722A" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Profile Modal ──────────────────────────────────────────── */}
      {showEditProfile && (
        <ModalWrapper
          onClose={() => { if (!editProfileSaving && !showDeleteConfirm) setShowEditProfile(false); }}
          zIndex={200}
          overlayBg="rgba(0,0,0,0.55)"
          maxWidth="380px"
          maxHeight="90vh"
          cardStyle={{
            background: t.surface, borderRadius: '20px',
            border: `1px solid ${t.border}`,
            boxShadow: darkMode ? '0 24px 80px rgba(0,0,0,0.6)' : '0 16px 48px rgba(0,0,0,0.15)',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 16px 0' }}>
              <button
                onClick={() => setShowEditProfile(false)}
                style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  border: `1px solid ${t.border}`, background: t.bg,
                  cursor: 'pointer', fontSize: '14px', color: t.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Avatar + Change Photo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px 20px' }}>
              <div style={{
                width: '88px', height: '88px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #E8722A, #3AADA0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', position: 'relative',
              }}>
                {editAvatarUrl
                  ? <img src={editAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '40px', lineHeight: 1 }}>👤</span>
                }
              </div>
              <label style={{ position: 'relative', marginTop: '8px', cursor: 'pointer' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: t.accent || '#E8722A' }}>Change Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !user) return;
                    try {
                      const ext = file.name.split('.').pop();
                      const path = `avatars/${user.id}.${ext}`;
                      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
                      if (upErr) throw upErr;
                      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
                      const publicUrl = urlData.publicUrl + '?t=' + Date.now();
                      setEditAvatarUrl(publicUrl);
                    } catch (err) {
                      console.error('Avatar upload error:', err);
                    }
                  }}
                />
              </label>
            </div>

            {/* Display Name */}
            <div style={{ padding: '0 24px 16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: t.textMuted, marginBottom: '6px' }}>
                Display Name
              </label>
              <input
                type="text"
                value={editDisplayName}
                onChange={e => setEditDisplayName(e.target.value)}
                placeholder="Your name"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px', fontSize: '14px',
                  background: t.bg, color: t.text, border: `1px solid ${t.border}`,
                  boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif",
                }}
              />
            </div>

            {/* Email */}
            <div style={{ padding: '0 24px 20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: t.textMuted, marginBottom: '6px' }}>
                Email
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={e => { setEditEmail(e.target.value); setEmailChangeNote(null); }}
                placeholder="your@email.com"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px', fontSize: '14px',
                  background: t.bg, color: t.text, border: `1px solid ${t.border}`,
                  boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif",
                }}
              />
              {editEmail && editEmail.trim().toLowerCase() !== (user?.email || '').toLowerCase() && !emailChangeNote && (
                <p style={{ fontSize: '11px', color: t.accent, marginTop: '6px', lineHeight: 1.4, fontFamily: "'DM Sans', sans-serif" }}>
                  A verification link will be sent to this new address. Your email won&apos;t change until you confirm it.
                </p>
              )}
              {emailChangeNote === 'sent' && (
                <p style={{ fontSize: '11px', color: '#22c55e', marginTop: '6px', lineHeight: 1.4, fontFamily: "'DM Sans', sans-serif" }}>
                  Verification email sent to <strong>{editEmail}</strong>. Check your inbox to confirm the change.
                </p>
              )}
            </div>

            {/* Save & Cancel */}
            <div style={{ padding: '0 24px 20px', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowEditProfile(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                  background: t.bg, color: t.textMuted, border: `1px solid ${t.border}`, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                disabled={editProfileSaving}
                onClick={async () => {
                  setEditProfileSaving(true);
                  try {
                    const updates = { data: { full_name: editDisplayName } };
                    if (editAvatarUrl && editAvatarUrl !== user?.user_metadata?.avatar_url) {
                      updates.data.avatar_url = editAvatarUrl;
                    }

                    // Handle email change — triggers verification, doesn't update DB until confirmed
                    const emailChanged = editEmail && editEmail.trim().toLowerCase() !== (user?.email || '').toLowerCase();
                    if (emailChanged) {
                      updates.email = editEmail.trim();
                    }

                    const { error } = await supabase.auth.updateUser(updates);
                    if (error) throw error;

                    // Refresh local user object
                    const { data: { user: refreshed } } = await supabase.auth.getUser();
                    if (refreshed) setUser(refreshed);

                    if (emailChanged) {
                      // Don't close modal — show confirmation note
                      setEmailChangeNote('sent');
                      setToast('Verification email sent — check your inbox');
                      setToastVariant('success');
                      setTimeout(() => { setToast(null); setToastVariant(null); }, 4000);
                    } else {
                      setShowEditProfile(false);
                      setToast('Profile updated');
                      setToastVariant('success');
                      setTimeout(() => { setToast(null); setToastVariant(null); }, 3000);
                    }
                  } catch (err) {
                    console.error('Profile save error:', err);
                    setToast(err.message || 'Failed to save profile');
                    setToastVariant('error');
                    setTimeout(() => { setToast(null); setToastVariant(null); }, 3000);
                  }
                  setEditProfileSaving(false);
                }}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                  background: '#E8722A', color: '#1C1917', border: 'none',
                  cursor: editProfileSaving ? 'wait' : 'pointer',
                  opacity: editProfileSaving ? 0.6 : 1,
                }}
              >
                {editProfileSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            {/* ── The Vault: Delete Account ── */}
            <div style={{
              borderTop: `1px solid ${t.border}`,
              padding: '16px 24px 20px',
              textAlign: 'center',
            }}>
              <p style={{
                fontSize: '12px', color: '#888888', margin: 0,
                fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
              }}>
                Not feeling the local jam right now?{' '}
                <span
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    fontWeight: 700, textDecoration: 'underline', cursor: 'pointer',
                    color: '#888888',
                  }}
                >
                  Delete your account here
                </span>
                {' '}and jump back in anytime.
              </p>
            </div>
        </ModalWrapper>
      )}

      {/* ── Delete Account Confirmation ─────────────────────────────────── */}
      {showDeleteConfirm && (
        <ModalWrapper
          onClose={() => { if (!deleteLoading) setShowDeleteConfirm(false); }}
          zIndex={210}
          maxWidth="340px"
          padding="28px 24px"
          cardStyle={{
            background: t.surface, borderRadius: '18px',
            border: `1px solid ${t.border}`,
            boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.7)' : '0 12px 40px rgba(0,0,0,0.2)',
            fontFamily: "'DM Sans', sans-serif", textAlign: 'center',
          }}
        >
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: t.text, margin: '0 0 12px' }}>
              Leaving the Jam?
            </h3>
            <p style={{ fontSize: '13px', color: t.textMuted, lineHeight: 1.6, margin: '0 0 24px' }}>
              Are you sure you want to delete your account? Your saved events and profile data will be removed.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                  background: t.bg, color: t.textMuted, border: `1px solid ${t.border}`, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                disabled={deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.access_token) {
                      await fetch('/api/delete-account', {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${session.access_token}` },
                      });
                    }
                    await supabase.auth.signOut();
                    setShowDeleteConfirm(false);
                    setShowEditProfile(false);
                    setUser(null);
                    setIsLoggedIn(false);
                    setActiveTab('home');
                    setToast('All set — your myLocalJam account has been deleted. Thanks for being part of the local jam scene.');
                    setToastVariant('success');
                    setTimeout(() => { setToast(null); setToastVariant(null); }, 5000);
                  } catch (err) {
                    console.error('Delete account error:', err);
                    setToast('Failed to delete account — contact support');
                    setToastVariant('error');
                    setTimeout(() => { setToast(null); setToastVariant(null); }, 4000);
                  }
                  setDeleteLoading(false);
                }}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                  background: '#EF4444', color: '#fff', border: 'none',
                  cursor: deleteLoading ? 'wait' : 'pointer',
                  opacity: deleteLoading ? 0.6 : 1,
                }}
              >
                {deleteLoading ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
        </ModalWrapper>
      )}

      {toast && <Toast message={toast} variant={toastVariant} onAction={toastAction} actionLabel={toastActionLabel} onDismiss={() => { setToast(null); setToastVariant(null); setToastAction(null); setToastActionLabel(null); }} />}
    </>
  );
}