'use client';

/**
 * SyncToggle — Lock / Unlock button for field-level inheritance control.
 *
 * Locked  (isLocked=true):  Field mirrors artist data (read-only).
 * Unlocked (isLocked=false): Field has custom event-level data (editable).
 *
 * Props:
 *   isLocked   (bool)   — Current lock state
 *   onToggle   (func)   — Called with the NEW lock state: onToggle(!isLocked)
 *   disabled   (bool)   — Disables the button (e.g., no linked artist)
 *   size       (string) — 'sm' | 'md' (default: 'sm')
 */
export default function SyncToggle({ isLocked = true, onToggle, disabled = false, size = 'sm' }) {
  const sizes = {
    sm: { width: '26px', height: '26px', iconSize: '13', radius: '6px' },
    md: { width: '30px', height: '30px', iconSize: '15', radius: '8px' },
  };
  const s = sizes[size] || sizes.sm;

  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle?.(!isLocked)}
      disabled={disabled}
      title={disabled ? 'No linked artist' : isLocked ? 'Synced with artist — click to customize' : 'Custom event data — click to revert to artist'}
      style={{
        width: s.width,
        height: s.height,
        borderRadius: s.radius,
        border: `1.5px solid ${isLocked ? 'rgba(59,130,246,0.30)' : 'rgba(232,114,42,0.30)'}`,
        background: isLocked ? 'rgba(59,130,246,0.08)' : 'rgba(232,114,42,0.08)',
        color: isLocked ? '#60A5FA' : '#E8722A',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s ease',
        padding: 0,
      }}
    >
      {isLocked ? (
        /* Locked icon — link / chain */
        <svg width={s.iconSize} height={s.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ) : (
        /* Unlocked icon — broken link / unlink */
        <svg width={s.iconSize} height={s.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" />
          <line x1="8" y1="2" x2="8" y2="5" />
          <line x1="2" y1="8" x2="5" y2="8" />
          <line x1="16" y1="19" x2="16" y2="22" />
          <line x1="19" y1="16" x2="22" y2="16" />
        </svg>
      )}
    </button>
  );
}
