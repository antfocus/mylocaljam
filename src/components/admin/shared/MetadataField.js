'use client';

import Badge from '@/components/ui/Badge';
import SyncToggle from './SyncToggle';
import { resolveTier, TIERS } from '@/lib/metadataWaterfall';

/**
 * MetadataField — Wrapper for any form field with a provenance badge.
 *
 * Two rendering modes (mutually exclusive):
 *
 * ─── MODE A: Waterfall (4-tier) ─────────────────────────────────────────
 * Activated when `sources` prop is passed. Renders the top-layer provenance
 * badge (Admin Override / Template / Artist Profile / Raw Scraper) + an
 * undo-icon Reset button that clears the override and lets the waterfall
 * flow down to the next tier. Used by the Event Edit Modal.
 *
 *   sources    (object)  — { override, template, artist, scraper }
 *   sourceType ('text'|'array') — how to decide a tier is "filled"
 *   onReset    (func)    — Called when the undo icon is clicked. Should
 *                          null/empty out the override on the parent form.
 *
 * ─── MODE B: Legacy (2-tier sync-lock) ──────────────────────────────────
 * Used by AdminArtistsTab + AdminEventTemplatesTab. Unchanged.
 *
 *   isCustom, isLocked, onToggleLock, onRevert, artistName, inheritedValue,
 *   inheritedType — all preserved for backward compat.
 *
 * ─── Shared props ───────────────────────────────────────────────────────
 *   label, children, hasArtist, required, hint, style
 */
export default function MetadataField({
  label,
  children,
  // Mode A — waterfall
  sources,
  sourceType = 'text',
  onReset,
  // Mode B — legacy sync-lock
  isCustom = false,
  artistName = '',
  isLocked = true,
  onToggleLock,
  onRevert,
  inheritedValue,
  inheritedType = 'text',
  // Shared
  hasArtist = true,
  required = false,
  hint,
  style = {},
}) {
  // Mode A takes precedence — compute the top tier from the waterfall.
  const waterfallMode = !!sources;
  const resolved = waterfallMode ? resolveTier(sources, sourceType) : null;
  const canReset = waterfallMode && resolved?.tier?.key === 'override' && typeof onReset === 'function';
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

        {/* ── MODE A: Waterfall badge + undo Reset ─────────────────────── */}
        {waterfallMode && (
          <>
            <Badge
              label={resolved.tier.label}
              size="sm"
              bg={resolved.tier.bg}
              color={resolved.tier.color}
              uppercase={false}
              style={{
                borderRadius: '999px',
                border: `1px solid ${resolved.tier.border}`,
              }}
            />
            {canReset && (
              <button
                type="button"
                onClick={onReset}
                title="Reset — clear override and inherit from next tier"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '22px', height: '22px', borderRadius: '6px',
                  background: 'rgba(232,114,42,0.08)',
                  border: '1px solid rgba(232,114,42,0.25)',
                  color: '#E8722A', cursor: 'pointer', padding: 0,
                  transition: 'all 0.15s',
                }}
              >
                {/* Undo / counter-clockwise arrow */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
            )}
          </>
        )}

        {/* ── MODE B: Legacy 2-tier source badge ───────────────────────── */}
        {!waterfallMode && hasArtist && (
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

        {/* Legacy sync toggle — only in legacy mode */}
        {!waterfallMode && hasArtist && onToggleLock && (
          <SyncToggle
            isLocked={isLocked}
            onToggle={onToggleLock}
            disabled={!hasArtist}
          />
        )}

        {/* Legacy Revert button */}
        {!waterfallMode && isCustom && onRevert && (
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

      {/* Inherited preview — legacy mode only, shown when locked */}
      {!waterfallMode && isLocked && hasArtist && inheritedValue && (
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
