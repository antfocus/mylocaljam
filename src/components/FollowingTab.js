'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { posthog } from '@/lib/posthog';
import ArtistMonogram from '@/components/ArtistMonogram';
import { supabase } from '@/lib/supabase';

// ── Path A regex filter — exclude obvious VENUE_EVENT rows from My Locals.
// Until the artists table gets a proper `kind` column (parked task), this
// strips the worst offenders by name pattern. Catches asterisk-wrapped
// names ("*Easter Sip & Shop*") and a small set of unambiguous event
// keywords. Soft cases like "80's Power Hour!" still slip through — those
// will need the `kind` column to fix properly. See PARKED.md #82-ish.
const EVENT_NAME_PATTERN = /^\*.+\*$/;
const EVENT_KEYWORD_PATTERN = /\b(trivia|karaoke|bingo|bogo|sip & shop|sip and shop|wing night|taco tuesday|burger night|drink special|happy hour)\b/i;
function looksLikeEvent(name) {
  if (!name) return false;
  if (EVENT_NAME_PATTERN.test(name)) return true;
  if (EVENT_KEYWORD_PATTERN.test(name)) return true;
  return false;
}

// ── Theme (matching page.js DARK/LIGHT) ─────────────────────────────────────
const DARK = {
  bg:         '#0D0D12',
  surface:    '#1A1A24',
  surfaceAlt: '#22222E',
  border:     '#2A2A3A',
  borderLight:'#22222E',
  text:       '#F0F0F5',
  textMuted:  '#7878A0',
  textSubtle: '#4A4A6A',
  accent:     '#E8722A',
  accentAlt:  '#3AADA0',
  inputBg:    '#22222E',
  cardBg:     '#1A1A24',
  followBg:   '#2A2A3A',
};
const LIGHT = {
  bg:         '#F7F5F2',
  surface:    '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border:     '#E5E7EB',
  borderLight:'#F3F4F6',
  text:       '#1F2937',
  textMuted:  '#6B7280',
  textSubtle: '#9CA3AF',
  accent:     '#E8722A',
  accentAlt:  '#3AADA0',
  inputBg:    '#F3F4F6',
  cardBg:     '#FFFFFF',
  followBg:   '#E5E7EB',
};

// ── Trending artists for empty state carousel ───────────────────────────────
const TRENDING_ARTISTS = [
  { name: 'Bobby Mahoney & The Seventh Son', genre: 'Rock' },
  { name: 'Levy & The Oaks',                 genre: 'Americana' },
  { name: 'The Burns',                        genre: 'Rock' },
  { name: 'Deal Casino',                      genre: 'Indie' },
  { name: 'Dentist',                          genre: 'Shoegaze' },
  { name: 'Avery Mandeville',                 genre: 'Pop' },
  { name: 'Lance Rizzo Band',                 genre: 'Blues' },
  { name: 'The Foes of Fern',                 genre: 'Indie Rock' },
  { name: 'Mike Dalton',                      genre: 'Acoustic' },
  { name: 'Secret Sound',                     genre: 'Alt Rock' },
];

/**
 * FollowingTab — View B of the unified Saved tab
 *
 * Displays followed Artists & Venues with:
 * - Entity avatar/thumbnail
 * - Entity name + "Next gig" subtext
 * - [✓ Following] button (unfollow on tap)
 * - Bell notification toggle
 * - Empty state with trending artist carousel
 */
export default function FollowingTab({
  darkMode = true,
  following = [],
  events = [],
  onUnfollow,
  onToggleNotif,
  onEntityTap,
  onFollow,
  searchQuery = '',
}) {
  const t = darkMode ? DARK : LIGHT;
  const [undoItem, setUndoItem] = useState(null); // { entity_type, entity_name, timer }

  // Normalize search
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Filter following list by search query AND by Path A event-pattern
  // filter — excludes asterisk-wrapped names and event keywords on
  // artist-type rows so My Locals stops surfacing entries like
  // "*Easter Sip & Shop*" alongside actual artists. Venue rows are
  // never filtered (they're already known to be venues).
  const filteredFollowing = useMemo(() => {
    let list = following.filter(f => {
      if (f.entity_type !== 'artist') return true;
      return !looksLikeEvent(f.entity_name);
    });
    if (searchQuery.trim()) {
      const q = normalize(searchQuery);
      list = list.filter(f => normalize(f.entity_name).includes(q));
    }
    return list;
  }, [following, searchQuery]);

  // Compute "next gig" for each followed entity from the events array
  const followingWithNextGig = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return filteredFollowing.map(f => {
      // If API already provided next_gig, use it
      if (f.next_gig) return f;
      // Otherwise compute from events
      const match = events
        .filter(e => {
          if (f.entity_type === 'venue') {
            return (e.venue || e.venue_name || '').toLowerCase() === f.entity_name.toLowerCase();
          }
          return (e.name || e.artist_name || '').toLowerCase() === f.entity_name.toLowerCase();
        })
        .filter(e => e.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      return { ...f, next_gig: match || null };
    });
  }, [filteredFollowing, events]);

  // Build artist name → image URL lookup from events array (fast path —
  // no extra network call, but only covers artists whose events are in
  // the current home feed).
  const artistImageMap = useMemo(() => {
    const map = {};
    for (const e of events) {
      const artistName = (e.name || e.artist_name || '').toLowerCase();
      if (artistName && !map[artistName]) {
        const img = e.artist_image || e.image_url || null;
        if (img) map[artistName] = img;
      }
    }
    return map;
  }, [events]);

  // Fallback map fetched directly from the artists table. Covers followed
  // artists whose upcoming events aren't in the current home feed (so the
  // events-derived map above misses them — was the symptom Tony spotted on
  // My Locals where most rows showed monograms even though the artists had
  // images in the DB). Fetched once per mount and cached.
  const [dbImageMap, setDbImageMap] = useState(null);
  useEffect(() => {
    if (dbImageMap !== null) return;
    if (!following || following.length === 0) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('artists')
        .select('name, image_url')
        .not('image_url', 'is', null)
        .limit(2000);
      if (cancelled) return;
      if (error) {
        console.error('[FollowingTab] artist image fallback fetch failed:', error.message);
        setDbImageMap({}); // mark "tried" so we don't loop
        return;
      }
      const map = {};
      for (const row of (data || [])) {
        if (row.name && row.image_url) {
          map[row.name.toLowerCase()] = row.image_url;
        }
      }
      setDbImageMap(map);
    })();
    return () => { cancelled = true; };
  }, [following, dbImageMap]);

  // Unfollow with undo toast
  const handleUnfollow = useCallback((entityType, entityName) => {
    // Clear any existing undo timer
    if (undoItem?.timer) clearTimeout(undoItem.timer);

    // Set undo state (show toast for 4s)
    const timer = setTimeout(() => {
      setUndoItem(null);
    }, 4000);

    setUndoItem({ entity_type: entityType, entity_name: entityName, timer });
    onUnfollow?.(entityType, entityName);
  }, [undoItem, onUnfollow]);

  const handleUndo = useCallback(() => {
    if (!undoItem) return;
    clearTimeout(undoItem.timer);
    onFollow?.(undoItem.entity_type, undoItem.entity_name);
    setUndoItem(null);
  }, [undoItem, onFollow]);

  // Format next gig date
  const formatNextGig = (nextGig) => {
    if (!nextGig) return null;
    const d = new Date(nextGig.event_date || (nextGig.date + 'T12:00:00'));
    if (isNaN(d)) return null;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateStr = d.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const tomStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Next gig: Tonight';
    if (dateStr === tomStr) return 'Next gig: Tomorrow';
    return `Next gig: ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
  };

  // ── Empty State ──────────────────────────────────────────────────────────
  if (following.length === 0) {
    return (
      <div style={{ padding: '40px 16px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>🎤</span>
        <p style={{ fontWeight: 700, fontSize: '16px', color: t.text, marginBottom: '6px' }}>
          You aren&apos;t following anyone yet!
        </p>
        <p style={{ fontSize: '14px', color: t.textMuted, lineHeight: 1.5, marginBottom: '24px' }}>
          Search for your favorite local bands or venues to get notified when they play next.
        </p>

        {/* Trending Local Artists carousel */}
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: t.textMuted, marginBottom: '10px', paddingLeft: '4px' }}>
            Trending Local Artists
          </p>
          <div style={{
            display: 'flex', gap: '10px', overflowX: 'auto',
            paddingBottom: '8px', scrollbarWidth: 'none', msOverflowStyle: 'none',
          }}>
            {TRENDING_ARTISTS.map((artist, i) => (
              <div key={i} style={{
                flexShrink: 0, width: '130px',
                background: t.cardBg, border: `1px solid ${t.border}`,
                borderRadius: '14px', padding: '14px 12px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                cursor: 'pointer',
              }}
                onClick={() => onFollow?.('artist', artist.name)}
              >
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentAlt})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px',
                }}>
                  🎤
                </div>
                <div style={{
                  fontSize: '12px', fontWeight: 700, color: t.text, textAlign: 'center',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  lineHeight: 1.3, minHeight: '31px',
                }}>
                  {artist.name}
                </div>
                <span style={{ fontSize: '10px', color: t.textMuted }}>{artist.genre}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onFollow?.('artist', artist.name); }}
                  style={{
                    padding: '5px 14px', borderRadius: '8px', cursor: 'pointer',
                    border: `1.5px solid ${t.accent}`, background: 'transparent',
                    color: t.accent, fontSize: '11px', fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  + Follow
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Following List (VIP Roster) ─────────────────────────────────────────────
  const avatarBg = darkMode ? '#2A2A38' : '#E5E7EB';
  const rowBorder = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const chevronClr = darkMode ? '#4A4A6A' : '#9CA3AF';

  // Local search state for artist filtering
  const [localSearch, setLocalSearch] = useState('');
  // Sort & filter state
  const [sortBy, setSortBy] = useState('alpha'); // 'alpha' | 'next_event' | 'recent'
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  const displayList = useMemo(() => {
    let list = followingWithNextGig;

    // Local search filter
    if (localSearch.trim()) {
      const q = normalize(localSearch);
      list = list.filter(f => normalize(f.entity_name).includes(q));
    }

    // Upcoming-only filter
    if (onlyUpcoming) {
      list = list.filter(f => f.next_gig);
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === 'alpha') {
        return a.entity_name.localeCompare(b.entity_name);
      }
      if (sortBy === 'recent') {
        // Most recently followed first (created_at descending)
        const aDate = a.created_at || '';
        const bDate = b.created_at || '';
        return bDate.localeCompare(aDate);
      }
      // Default: next_event — soonest gig first, no-gig artists sink to bottom
      const aGig = a.next_gig?.event_date || a.next_gig?.date || '';
      const bGig = b.next_gig?.event_date || b.next_gig?.date || '';
      if (aGig && !bGig) return -1;
      if (!aGig && bGig) return 1;
      if (!aGig && !bGig) return a.entity_name.localeCompare(b.entity_name);
      return aGig.localeCompare(bGig);
    });

    return list;
  }, [followingWithNextGig, localSearch, sortBy, onlyUpcoming]);

  return (
    <div style={{ padding: '12px 16px 20px' }}>
      {/* Search bar */}
      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Search your artists..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px',
            borderRadius: '10px', border: 'none',
            background: t.inputBg, color: t.text,
            fontSize: '14px', fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Sort & Filter bar */}
      <div ref={sortMenuRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', position: 'relative' }}>
        <p style={{ fontSize: '12px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
          {displayList.length} following
        </p>
        <button
          onClick={() => setShowSortMenu(prev => !prev)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: 'transparent', border: `1px solid ${t.border}`,
            borderRadius: '8px', padding: '5px 10px', cursor: 'pointer',
            fontSize: '11px', fontWeight: 600, color: t.textMuted,
            fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s ease',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" fill="currentColor" />
          </svg>
          {sortBy === 'next_event' ? 'Next Event' : sortBy === 'alpha' ? 'A–Z' : 'Recent'}
        </button>

        {/* Dropdown menu */}
        {showSortMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '6px',
              background: t.surface, border: `1px solid ${t.border}`,
              borderRadius: '12px', padding: '6px', minWidth: '200px',
              boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.12)',
              zIndex: 50, fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, padding: '6px 10px 4px', margin: 0 }}>
              Sort by
            </p>
            {[
              { key: 'alpha', label: 'Alphabetical (A–Z)' },
              { key: 'next_event', label: 'Next Event Date' },
              { key: 'recent', label: 'Recently Added' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => { setSortBy(opt.key); setShowSortMenu(false); posthog.capture?.('List Sorted/Filtered', { sort_type: opt.key === 'alpha' ? 'A-Z' : opt.key === 'next_event' ? 'Next Event' : 'Recent' }); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '9px 10px', border: 'none',
                  background: sortBy === opt.key ? (darkMode ? 'rgba(232,114,42,0.08)' : 'rgba(232,114,42,0.06)') : 'transparent',
                  borderRadius: '8px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: sortBy === opt.key ? 700 : 500,
                  color: sortBy === opt.key ? t.accent : t.text,
                  fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
                }}
              >
                {opt.label}
                {sortBy === opt.key && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill={t.accent} />
                  </svg>
                )}
              </button>
            ))}

            <div style={{ height: '1px', background: t.border, margin: '6px 4px' }} />

            <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, padding: '4px 10px 4px', margin: 0 }}>
              Filter
            </p>
            <button
              onClick={() => { setOnlyUpcoming(prev => !prev); setShowSortMenu(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '9px 10px', border: 'none',
                background: onlyUpcoming ? (darkMode ? 'rgba(232,114,42,0.08)' : 'rgba(232,114,42,0.06)') : 'transparent',
                borderRadius: '8px', cursor: 'pointer',
                fontSize: '13px', fontWeight: onlyUpcoming ? 700 : 500,
                color: onlyUpcoming ? t.accent : t.text,
                fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
              }}
            >
              Only with upcoming events
              <div style={{
                width: '32px', height: '18px', borderRadius: '999px', position: 'relative',
                background: onlyUpcoming ? t.accent : (darkMode ? '#4A4A6A' : '#D1D5DB'),
                transition: 'background 0.2s', flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute', top: '2px',
                  left: onlyUpcoming ? '16px' : '2px',
                  width: '14px', height: '14px', borderRadius: '50%',
                  background: 'white', transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </button>
          </div>
        )}
      </div>

      {displayList.length === 0 && (localSearch.trim() || searchQuery.trim() || onlyUpcoming) && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ fontSize: '14px', color: t.textMuted }}>
            {onlyUpcoming && !localSearch.trim() ? 'None of your artists have upcoming events' : 'No results found'}
          </p>
        </div>
      )}

      {/* Vertical list */}
      {displayList.map((f, i) => {
        // Image lookup waterfall: events-derived map first (covers artists
        // with upcoming events in the home feed), then artists-table fallback
        // (covers everyone else who has an image_url stored on their row).
        const lowerName = f.entity_name.toLowerCase();
        const imgUrl = artistImageMap[lowerName] || dbImageMap?.[lowerName] || null;
        const isLast = i === displayList.length - 1;

        return (
          <div
            key={`${f.entity_type}-${f.entity_name}-${i}`}
            onClick={() => onEntityTap?.(f.entity_type, f.entity_name)}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '12px 16px',
              borderBottom: isLast ? 'none' : `1px solid ${rowBorder}`,
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          >
            {/* Avatar — image when we have one, ArtistMonogram when we
                don't. Replaces the previous generic music-note placeholder
                so the no-image state still feels designed and gives each
                artist a stable color signature. */}
            {imgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt={f.entity_name}
                style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  objectFit: 'cover', objectPosition: 'center top',
                  flexShrink: 0,
                }}
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
              />
            ) : null}
            <div style={{
              display: imgUrl ? 'none' : 'block',
              flexShrink: 0,
            }}>
              <ArtistMonogram
                name={f.entity_name}
                size="sm"
                style={{ width: '48px', height: '48px' }}
              />
            </div>

            {/* Name */}
            <div style={{
              flex: 1, minWidth: 0, marginLeft: '14px',
              fontSize: '16px', fontWeight: 600, color: t.text,
              fontFamily: "'DM Sans', sans-serif",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {f.entity_name}
            </div>

            {/* Conditional date — only visible when sorted by Next Event Date */}
            {sortBy === 'next_event' && f.next_gig && (
              <span style={{
                fontSize: '12px', fontWeight: 500, color: t.textMuted,
                fontFamily: "'DM Sans', sans-serif",
                flexShrink: 0, marginLeft: '8px', whiteSpace: 'nowrap',
              }}>
                {(() => {
                  const g = f.next_gig;
                  const d = new Date((g.event_date || g.date) + (g.event_date ? '' : 'T12:00:00'));
                  if (isNaN(d)) return '';
                  const today = new Date();
                  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                  const ds = d.toISOString().split('T')[0];
                  if (ds === today.toISOString().split('T')[0]) return 'Tonight';
                  if (ds === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                })()}
              </span>
            )}

            {/* Chevron */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: '8px' }}>
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill={chevronClr} />
            </svg>
          </div>
        );
      })}

      {/* Undo toast */}
      {undoItem && (
        <div style={{
          position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
          maxWidth: '400px', width: 'calc(100% - 32px)',
          background: darkMode ? '#2A2A3A' : '#374151',
          color: 'white', padding: '12px 16px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 200,
          animation: 'slideUp 0.2s ease-out',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>
            Unfollowed {undoItem.entity_name}
          </span>
          <button
            onClick={handleUndo}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: t.accent, fontSize: '13px', fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              padding: '4px 8px',
            }}
          >
            Undo
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
