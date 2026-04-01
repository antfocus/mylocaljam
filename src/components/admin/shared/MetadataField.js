'use client';

import Badge from '@/components/ui/Badge';
import SyncToggle from './SyncToggle';

/**
 * MetadataField — Wrapper for any form field with source badge + sync toggle.
 *
 * Renders a label row with:
 *   1. Field label
 *   2. Source Badge — [Inherited: Artist] (blue) or [Custom: Event] (orange)
 *   3. SyncToggle button (lock/unlock)
 *   4. Optional Revert button (when custom data exists)
 *
 * Props:
 *   label          (string)  — Field label text
 *   children       (node)    — The input / textarea / selector to wrap
 *   isCustom       (bool)    — true = event-level override; false = inherited
 *   artistName     (string)  — Name of linked artist (for badge text)
 *   isLocked       (bool)    — Current sync-lock state
 *   onToggleLock   (func)    — Called with new lock state
 *   onRevert       (func)    — Called when user clicks Revert (clears custom value)
 *   hasArtist      (bool)    — false hides all inheritance UI (standalone event mode)
 *   required       (bool)    — Show asterisk on label
 *   hint           (string)  — Small helper text below the field
 *   inheritedValue (string)  — The artist's value, shown as preview when locked
 *   inheritedType  (string)  — 'text' | 'image' — controls preview rendering
 *   style          (object)  — Additional style overrides on outer wrapper
 */
export default function MetadataField({
  label,
  children,
  isCustom = false,
  artistName = '',
  isLocked = true,
  onToggleLock,
  onRevert,
  hasArtist = true,
  required = false,
  hint,
  inheritedValue,
  inheritedType = 'text',
  style = {},
}) {
  return (
    <div style={{ marginBottom: '14px', ...style }}>
      {/* Label row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        marginBottom: '5px', flexWrap: 'wrap',
      }}>
        <label style={{
          fontSize: '11px', fontWeight: 700,
          color: 'var(--text-secondary)',
          fontFamily: "'DM Sans', sans-serif",
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {label}{required ? ' *' : ''}
        </label>

        {/* Source badge — only when an artist is linked */}
        {hasArtist && (
          <Badge
            label={isCustom ? 'Custom: Event' : `Inherited: ${artistName || 'Artist'}`}
            size="sm"
            bg={isCustom ? 'rgba(232,114,42,0.12)' : 'rgba(59,130,246,0.10)'}
            color={isCustom ? '#E8722A' : '#60A5FA'}
            uppercase={false}
            style={{
              borderRadius: '999px',
              border: `1px solid ${isCustom ? 'rgba(232,114,42,0.25)' : 'rgba(59,130,246,0.20)'}`,
            }}
          />
        )}

        {/* Sync toggle — only when an artist is linked */}
        {hasArtist && onToggleLock && (
          <SyncToggle
            isLocked={isLocked}
            onToggle={onToggleLock}
            disabled={!hasArtist}
          />
        )}

        {/* Revert button — only when field has custom data */}
        {isCustom && onRevert && (
          <button
            type="button"
            onClick={onRevert}
            style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
              background: 'rgba(239,68,68,0.08)', color: '#F87171',
              border: '1px solid rgba(239,68,68,0.20)', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            title="Clear custom value and revert to artist default"
          >
            ✕ Revert
          </button>
        )}
      </div>

      {/* Field content */}
      {children}

      {/* Inherited preview — shown when locked and artist has a value */}
      {isLocked && hasArtist && inheritedValue && (
        <InheritedPreview value={inheritedValue} type={inheritedType} />
      )}

      {/* Hint text */}
      {hint && (
        <p style={{
          fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/* ── Inherited preview (greyed-out read-only display) ──────────────────── */
function InheritedPreview({ value, type }) {
  if (!value) return null;

  if (type === 'image') {
    return (
      <div style={{
        marginTop: '6px', borderRadius: '8px', overflow: 'hidden',
        aspectRatio: '16/9', maxHeight: '100px', position: 'relative', opacity: 0.5,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Inherited artist image"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
        />
        <div style={{
          position: 'absolute', bottom: '4px', left: '4px',
          fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(0,0,0,0.7)', color: '#94A3B8',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Artist default image
        </div>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: '4px', padding: '8px 12px', borderRadius: '8px',
      background: 'var(--bg-elevated)', border: '1px dashed var(--border)',
      fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic',
      maxHeight: '60px', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <span style={{
        fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
        display: 'block', marginBottom: '2px', fontStyle: 'normal',
      }}>
        Inherited from artist:
      </span>
      {value.substring(0, 200)}{value.length > 200 ? '…' : ''}
    </div>
  );
}
