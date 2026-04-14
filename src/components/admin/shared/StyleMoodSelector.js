'use client';

/**
 * StyleMoodSelector — Shared multi-select pill grid for genres and vibes.
 *
 * Displays ALL options in a permanent grid layout.
 * Unselected tags are muted/outline; selected tags are highlighted.
 * No 'Other' or custom text input allowed.
 *
 * Props:
 *   label       (string)   — Section label (e.g., "Genres", "Vibes")
 *   options     (string[]) — All available options
 *   selected    (string[]|string) — Currently selected values (array or comma string)
 *   onChange    (func)     — Called with updated selection (same type as input)
 *   disabled    (bool)     — Disables all pills (e.g., field is locked)
 *   accentColor (string)   — Active pill color (default: '#E8722A')
 */

// Re-exported from @/lib/utils to keep one source of truth. Historical callers
// of this barrel (EventFormModal, AdminEventTemplatesTab) keep working without
// changes, but the actual list now lives in utils.js.
import { GENRES, VIBES } from '@/lib/utils';

export { GENRES, VIBES };

export default function StyleMoodSelector({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  accentColor = '#E8722A',
}) {
  // Normalize selected to an array regardless of input type
  const isStringMode = typeof selected === 'string';
  const selectedArr = isStringMode
    ? selected.split(',').map(s => s.trim()).filter(Boolean)
    : (Array.isArray(selected) ? selected : []);

  const handleToggle = (option) => {
    if (disabled) return;
    const isSelected = selectedArr.includes(option);
    const next = isSelected
      ? selectedArr.filter(x => x !== option)
      : [...selectedArr, option];

    // Return in the same format as input
    onChange(isStringMode ? next.join(', ') : next);
  };

  // Determine grid columns: 3 for genres (15 items), 2 for vibes (4 items)
  const cols = options.length > 6 ? 3 : 2;

  return (
    <div>
      {label && (
        <span style={{
          fontSize: '11px', fontWeight: 700,
          color: 'var(--text-secondary)',
          fontFamily: "'DM Sans', sans-serif",
          textTransform: 'uppercase', letterSpacing: '0.5px',
          display: 'block', marginBottom: '6px',
        }}>
          {label}
        </span>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '5px',
      }}>
        {options.map(option => {
          const active = selectedArr.includes(option);
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => handleToggle(option)}
              style={{
                padding: '6px 6px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: active ? 700 : 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: disabled ? 'not-allowed' : 'pointer',
                border: active ? `1.5px solid ${accentColor}` : '1px solid var(--border)',
                background: active ? `${accentColor}18` : 'transparent',
                color: active ? accentColor : 'var(--text-muted)',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.12s ease',
                textAlign: 'center',
                lineHeight: 1.3,
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
