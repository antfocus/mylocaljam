'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';

export default function SiteHeader({ onOpenSubmit }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);

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
      {/* Left: Text Logo */}
      <a
        href="/"
        className="logo-text"
        style={{
          fontSize: '28px',
          textDecoration: 'none',
          flexShrink: 0,
          lineHeight: 1,
          display: searchOpen ? 'none' : 'block',
        }}
        aria-label="myLocalJam home"
      >
        myLocalJam
      </a>

      {/* Center: Jar Logo / Search Bar */}
      <div
        ref={containerRef}
        className="search-bar-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: searchOpen ? 1 : 'none',
          maxWidth: searchOpen ? '600px' : '70px',
          margin: searchOpen ? '0 16px' : '0',
        }}
      >
        {!searchOpen ? (
          <button
            onClick={openSearch}
            aria-label="Open search — search artists, venues, events"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              src="/myLocaljam_Logo_200.png"
              alt="myLocalJam — click to search"
              width={60}
              height={60}
              priority
              className="jar-logo"
              style={{ objectFit: 'contain' }}
            />
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
