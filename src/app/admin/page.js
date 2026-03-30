'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import EventFormModal from '@/components/EventFormModal';

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