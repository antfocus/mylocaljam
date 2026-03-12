'use client';

export default function SectionHeading({
  dateKey,
  eventCount,
  hasActiveFilters,
  onClearFilters,
}) {
  const dateLabels = {
    all:      'All Upcoming',
    today:    'Today',
    tomorrow: 'Tomorrow',
    weekend:  'This Weekend',
  };

  const heading = dateLabels[dateKey] || 'All Upcoming';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px 8px',
    }}>
      {/* Left: heading + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: 700,
          fontFamily: "'Syne', sans-serif",
          color: '#e8e8f0',
          margin: 0,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}>
          {heading}
        </h2>

        {eventCount !== undefined && (
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'rgba(232,232,240,0.5)',
            background: 'rgba(255,255,255,0.07)',
            padding: '3px 10px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {eventCount} event{eventCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Right: clear filters link */}
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#6b7280',
            fontFamily: "'DM Sans', sans-serif",
            padding: '4px 0',
            flexShrink: 0,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.target.style.color = '#e8e8f0'}
          onMouseLeave={e => e.target.style.color = '#6b7280'}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
