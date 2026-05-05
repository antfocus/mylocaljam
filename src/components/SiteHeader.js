'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import useTheme from '@/hooks/useTheme';

export default function SiteHeader({ onOpenSubmit }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const { darkMode } = useTheme();

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') closeSearch(); };
    if (searchOpen) {
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [searchOpen, closeSearch]);

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) closeSearch();
    };
    if (searchOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [searchOpen, closeSearch]);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        height: '70px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      {/* Left: Logo — large and prominent */}
      <div style={{
        flexShrink: 0,
        display: searchOpen ? 'none' : 'flex',
        alignItems: 'center',
      }}>
        <a href="/" aria-label="myLocalJam home" style={{ display: 'flex', alignItems: 'center' }}>
          {/* Mode-responsive wordmark with soundwave glyph (May 5, 2026 —
              ChatGPT-rebrand replacement for the v8 teal-removal pass).
              v9 dark variant: white "myLocal" + orange "jam" + orange
              soundwave on transparent (renders on dark mode header bg).
              v9 light variant: dark-navy "myLocal" + orange "jam" + orange
              soundwave on transparent (renders on light mode header bg).
              Both PNGs were preprocessed via PIL to strip the baked-in
              backgrounds and crop to content bbox so they slot into the
              header without showing a colored rectangle. */}
          <Image
            src={darkMode ? '/myLocaljam_Logo_v9_soundwave_dark.png' : '/myLocaljam_Logo_v9_soundwave_light.png'}
            alt="myLocalJam"
            width={220}
            height={56}
            priority
            className="jar-logo"
            style={{
              objectFit: 'contain',
              filter: darkMode
                ? 'drop-shadow(0 1px 4px rgba(0,0,0,0.45))'
                : 'drop-shadow(0 1px 4px rgba(0,0,0,0.18))',
            }}
          />
        </a>
      </div>

      {/* Center: Search Bar */}
      <div
        ref={containerRef}
        className="search-bar-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          maxWidth: '600px',
          margin: '0 16px',
        }}
      >
        {!searchOpen ? (
          <button
            onClick={openSearch}
            aria-label="Open search — search artists, venues, events"
            className="search-bar-bg"
            style={{
              background: 'none',
              border: '1.5px solid var(--border)',
              cursor: 'pointer',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '999px',
              height: '38px',
              width: '100%',
            }}
          >
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>🔍</span>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>Search artists, venues, events...</span>
          </button>
        ) : (
          <div
            className="search-bar-bg"
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              height: '44px',
              borderRadius: '999px',
              padding: '0 16px',
              gap: '10px',
              border: '1.5px solid var(--border-hover)',
            }}
          >
            <span style={{ fontSize: '16px', color: 'var(--text-muted)', flexShrink: 0 }}>
              🔍
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search artists, venues, events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'none',
                outline: 'none',
                fontSize: '15px',
                color: 'var(--text-primary)',
                fontFamily: 'Inter, sans-serif',
              }}
              aria-label="Search artists, venues, events"
            />
            <button
              onClick={closeSearch}
              aria-label="Close search"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                color: 'var(--text-muted)',
                padding: '4px',
                lineHeight: 1,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Right: Add Button */}
      <button
        onClick={onOpenSubmit}
        className="plus-btn"
        aria-label="Add to the Jar — submit a new event"
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'var(--accent-teal)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '24px',
          fontWeight: 300,
          display: searchOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        +
      </button>
    </header>
  );
}
