'use client';

const BRAND_ORANGE = '#E8722A';

export default function ArtistListItem({
  name,
  imageUrl = null,
  nextGigText = null,
  darkMode = true,
  onRemove,
  isLast = false,
}) {
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted   = darkMode ? '#8A8AA8' : '#6B7280';
  const removeClr   = darkMode ? '#6A6A8A' : '#9CA3AF';
  const borderClr   = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const avatarBg    = darkMode ? '#2A2A38' : '#E5E7EB';
  const gigColor    = darkMode ? '#3AADA0' : '#2A8F8A';

  const handleRemove = (e) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Unfollow ${name}?`);
    if (confirmed) onRemove?.();
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${borderClr}`,
    }}>
      {/* Avatar */}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          style={{
            width: '48px', height: '48px', borderRadius: '50%',
            objectFit: 'cover', flexShrink: 0,
          }}
          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
        />
      ) : null}
      {/* Fallback avatar — always rendered, hidden if image loads */}
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%',
        background: avatarBg, flexShrink: 0,
        display: imageUrl ? 'none' : 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Material: music_note SVG in Brand Orange */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill={BRAND_ORANGE} />
        </svg>
      </div>

      {/* Name + next gig */}
      <div style={{ flex: 1, minWidth: 0, marginLeft: '14px' }}>
        <div style={{
          fontSize: '16px', fontWeight: 600, color: textPrimary,
          fontFamily: "'DM Sans', sans-serif",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        {nextGigText && (
          <div style={{
            fontSize: '12px', fontWeight: 600, color: gigColor,
            fontFamily: "'DM Sans', sans-serif",
            marginTop: '2px',
          }}>
            {nextGigText}
          </div>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px', flexShrink: 0, marginLeft: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        title="Unfollow"
      >
        {/* Material: remove_circle_outline */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M7 11v2h10v-2H7zm5-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill={removeClr} />
        </svg>
      </button>
    </div>
  );
}
