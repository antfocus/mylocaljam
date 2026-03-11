'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';

const ThemeContext = createContext({ dark: true, toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('mlj_theme');
    if (stored) {
      setDark(stored === 'dark');
    } else {
      setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    setMounted(true);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      if (!localStorage.getItem('mlj_theme')) setDark(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggle = useCallback(() => {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('mlj_theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  // Apply data-theme attribute to html
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.2s ease' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
