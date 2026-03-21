'use client';

import { useState, useMemo, useCallback } from 'react';

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

  // Filter following list by search query
  const filteredFollowing = useMemo(() => {
    if (!searchQuery.trim()) return following;
    const q = normalize(searchQuery);
    return following.filter(f => normalize(f.entity_name).includes(q));
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

  // Build artist name → image URL lookup from events array
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
  const displayList = useMemo(() => {
    if (!localSearch.trim()) return followingWithNextGig;
    const q = normalize(localSearch);
    return followingWithNextGig.filter(f => normalize(f.entity_name).includes(q));
  }, [followingWithNextGig, localSearch]);

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

      <p style={{ fontSize: '12px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
        {displayList.length} following
      </p>

      {displayList.length === 0 && (localSearch.trim() || searchQuery.trim()) && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ fontSize: '14px', color: t.textMuted }}>No results found</p>
        </div>
      )}

      {/* Vertical list */}
      {displayList.map((f, i) => {
        const imgUrl = artistImageMap[f.entity_name.toLowerCase()] || null;
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
            {/* Avatar */}
            {imgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt={f.entity_name}
                style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  objectFit: 'cover', flexShrink: 0,
                }}
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
              />
            ) : null}
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: avatarBg, flexShrink: 0,
              display: imgUrl ? 'none' : 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill={t.accent} />
              </svg>
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
