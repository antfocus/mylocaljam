'use client';

/**
 * StyleMoodSelector — Shared multi-select pill grid for genres and vibes.
 *
 * Used by both Event and Artist modals for visual parity.
 * Supports two modes:
 *   - Array mode: selected = ['Rock', 'Jazz'], onChange receives updated array
 *   - String mode: selected = 'Rock, Jazz', onChange receives updated comma string
 *
 * Props:
 *   label       (string)   — Section label (e.g., "Genres", "Vibes")
 *   options     (string[]) — All available options
 *   selected    (string[]|string) — Currently selected values (array or comma string)
 *   onChange    (func)     — Called with updated selection (same type as input)
 *   disabled    (bool)     — Disables all pills (e.g., field is locked)
 *   columns     (number)   — CSS grid column count hint (default: auto-flow)
 *   accentColor (string)   — Active pill color (default: '#E8722A')
 */

const GENRES = [
  'Rock / Alternative', 'Yacht Rock / Surf', 'R&B / Soul / Funk',
  'Country / Americana', 'Pop / Top 40', 'Acoustic / Singer-Songwriter',
  'Jazz / Blues', 'Reggae / Island', 'Jam / Psych',
  'Metal / Hardcore', 'Punk / Ska', 'Hip-Hop / Rap',
  'Electronic / DJ', 'Latin / World', 'Tributes / Covers',
];

const VIBES = [
  'Acoustic / Intimate', 'Outdoor / Patio', 'Family-Friendly',
  'High-Energy / Dance', 'Chill / Low-Key', 'Late Night / Party',
];

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
        display: 'flex', flexWrap: 'wrap', gap: '6px',
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
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: disabled ? 'not-allowed' : 'pointer',
                border: 'none',
                background: active ? `${accentColor}22` : 'var(--bg-card)',
                color: active ? accentColor : 'var(--text-muted)',
                outline: active ? `1.5px solid ${accentColor}` : '1px solid var(--border)',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.12s ease',
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
