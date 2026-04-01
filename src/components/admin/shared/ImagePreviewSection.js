'use client';

import { useState } from 'react';

/**
 * ImagePreviewSection — Unified image preview with 16:9 ratio and inheritance.
 *
 * Handles both Event and Artist contexts:
 *   - Shows the active image at full opacity with 16:9 aspect ratio
 *   - If inheriting, shows the artist image at 80% opacity with a label overlay
 *   - Supports carousel navigation when multiple candidates are available
 *   - Graceful error fallback (emoji placeholder)
 *
 * Props:
 *   imageUrl         (string)   — Current image URL to display
 *   inheritedUrl     (string)   — Artist's image URL (shown when imageUrl is empty)
 *   isInherited      (bool)     — true = displaying inherited image, not custom
 *   onUrlChange      (func)     — Called with new URL string when input changes
 *   disabled         (bool)     — Makes input read-only
 *   candidates       (string[]) — Image candidate URLs for carousel
 *   candidateIdx     (number)   — Current carousel index
 *   onCandidateNav   (func)     — Called with new index: onCandidateNav(newIdx)
 *   label            (string)   — Override preview label (default: "Mobile Preview")
 *   maxPreviewHeight (string)   — CSS max-height for preview (default: '180px')
 *   placeholder      (string)   — Input placeholder text
 */
export default function ImagePreviewSection({
  imageUrl = '',
  inheritedUrl = '',
  isInherited = false,
  onUrlChange,
  disabled = false,
  candidates = [],
  candidateIdx = 0,
  onCandidateNav,
  label = 'Mobile Preview',
  maxPreviewHeight = '180px',
  placeholder = 'https://...',
}) {
  const [imgError, setImgError] = useState(false);

  const displayUrl = imageUrl || inheritedUrl;
  const showInheritedOverlay = !imageUrl && !!inheritedUrl;
  const hasCandidates = candidates.length > 1;

  return (
    <div>
      {/* URL Input with optional carousel nav */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '8px' }}>
        {hasCandidates && !disabled && (
          <button
            type="button"
            onClick={() => {
              const prev = (candidateIdx - 1 + candidates.length) % candidates.length;
              onCandidateNav?.(prev);
            }}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '6px', width: '28px', height: '34px', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            title="Previous image"
          >&lt;</button>
        )}

        <input
          type="text"
          value={imageUrl}
          onChange={e => { setImgError(false); onUrlChange?.(e.target.value); }}
          readOnly={disabled}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: '8px',
            fontSize: '13px', fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
            background: disabled ? 'var(--bg-elevated)' : 'var(--bg-card)',
            border: `1px solid ${disabled ? 'var(--border)' : 'var(--border)'}`,
            color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'text',
            opacity: disabled ? 0.6 : 1,
          }}
        />

        {hasCandidates && !disabled && (
          <button
            type="button"
            onClick={() => {
              const next = (candidateIdx + 1) % candidates.length;
              onCandidateNav?.(next);
            }}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '6px', width: '28px', height: '34px', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            title="Next image"
          >&gt;</button>
        )}
      </div>

      {/* Preview label row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{
          fontSize: '10px', color: 'var(--text-muted)',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {label}
        </span>
        {hasCandidates && (
          <span style={{
            fontSize: '10px', color: '#E8722A', fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {candidateIdx + 1} of {candidates.length}
          </span>
        )}
        {showInheritedOverlay && (
          <span style={{
            fontSize: '9px', fontWeight: 700, color: '#60A5FA',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            (Artist default)
          </span>
        )}
      </div>

      {/* 16:9 Image Preview */}
      <div style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        maxHeight: maxPreviewHeight,
        borderRadius: '10px',
        overflow: 'hidden',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}>
        {displayUrl && !imgError ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt="Preview"
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'center',
                display: 'block',
                opacity: showInheritedOverlay ? 0.5 : 1,
                transition: 'opacity 0.2s ease',
              }}
              onError={() => setImgError(true)}
            />
            {showInheritedOverlay && (
              <div style={{
                position: 'absolute', bottom: '6px', left: '6px',
                fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                background: 'rgba(0,0,0,0.75)', color: '#94A3B8',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Inherited from artist
              </div>
            )}
          </>
        ) : (
          /* Empty / error fallback */
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', gap: '4px',
          }}>
            <span style={{ fontSize: '28px' }}>🎤</span>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {imgError ? 'Image failed to load' : 'No image set'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
