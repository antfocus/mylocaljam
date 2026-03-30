'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatTimeRange } from '@/lib/utils';
import { posthog } from '@/lib/posthog';

const CATEGORY_CONFIG = {
  'Live Music':      { color: '#E8722A', bg: '#E8722A', emoji: '🎵' },
  'Music':           { color: '#E8722A', bg: '#E8722A', emoji: '🎵' },
  'Happy Hour':      { color: '#3AADA0', bg: '#3AADA0', emoji: '🍹' },
  'Happy Hours':     { color: '#3AADA0', bg: '#3AADA0', emoji: '🍹' },
  'Daily Special':   { color: '#F59E0B', bg: '#F59E0B', emoji: '⭐' },
  'Daily Specials':  { color: '#F59E0B', bg: '#F59E0B', emoji: '⭐' },
  'Community':       { color: '#8B5CF6', bg: '#8B5CF6', emoji: '🤝' },
  'Community Event': { color: '#8B5CF6', bg: '#8B5CF6', emoji: '🤝' },
};

const DEFAULT_CONFIG = { color: '#E8722A', bg: '#E8722A', emoji: '🎵' };

export default function EventCardV2({ event, isFavorited = false, onToggleFavorite, darkMode = true, onFollowArtist, isArtistFollowed, onFlag, autoExpand = false }) {