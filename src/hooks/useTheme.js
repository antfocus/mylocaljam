'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useTheme — three-way theme preference: 'auto' | 'light' | 'dark'.
 *
 *   • 'auto'  (default) — follows the OS color scheme via prefers-color-scheme.
 *                          Updates live when the user toggles their phone or
 *                          when their iPhone's "Automatic" mode swaps at sundown.
 *   • 'light' — always light, ignores the OS.
 *   • 'dark'  — always dark, ignores the OS.
 *
 * Returns:
 *   { darkMode: boolean, themePreference: string, setThemePreference(value) }
 *
 * Migration: if the legacy `mlj_dark_mode` boolean is present in localStorage,
 * we map it to 'dark' / 'light' on first read and write the new key. The old
 * key is left in place during a transition window so a rollback to the old
 * code path doesn't lose the user's preference.
 */

const KEY = 'mlj_theme';
const LEGACY_KEY = 'mlj_dark_mode';
const VALID = ['auto', 'light', 'dark'];

function readInitialPref() {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = localStorage.getItem(KEY);
    if (v && VALID.includes(v)) return v;
    // Migrate the old boolean key
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      const migrated = legacy === 'true' ? 'dark' : 'light';
      localStorage.setItem(KEY, migrated);
      return migrated;
    }
  } catch {}
  return 'auto';
}

function systemPrefersDark() {
  if (typeof window === 'undefined') return true; // SSR — match the historical default
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

export default function useTheme() {
  const [pref, setPref] = useState(readInitialPref);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Watch the OS color-scheme media query while the user is on 'auto'. We
  // attach the listener regardless of pref so we always know the system state
  // (cheaper than re-querying), but only re-render the resolved theme when
  // pref === 'auto' below.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange); // older Safari
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const setThemePreference = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setPref(next);
    try { localStorage.setItem(KEY, next); } catch {}
  }, []);

  const darkMode =
    pref === 'light' ? false :
    pref === 'dark' ? true :
    systemDark;

  return { darkMode, themePreference: pref, setThemePreference };
}
