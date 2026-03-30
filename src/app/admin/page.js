'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import EventFormModal from '@/components/EventFormModal';
import AdminDashboardTab from '@/components/admin/AdminDashboardTab';
import AdminTriageTab from '@/components/admin/AdminTriageTab';
import AdminEventsTab from '@/components/admin/AdminEventsTab';
import AdminArtistsTab from '@/components/admin/AdminArtistsTab';
import AdminSpotlightTab from '@/components/admin/AdminSpotlightTab';
import AdminVenuesTab from '@/components/admin/AdminVenuesTab';
import AdminFestivalsTab from '@/components/admin/AdminFestivalsTab';
import AdminSubmissionsTab from '@/components/admin/AdminSubmissionsTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminArtistModals from '@/components/admin/AdminArtistModals';

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