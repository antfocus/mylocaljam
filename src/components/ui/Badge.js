'use client';

/**
 * Badge — Reusable inline badge / chip / tag component.
 *
 * Matches the inline-style pattern used across the admin dashboard and
 * public-facing components (StatusBadge in SubmitEventModal, LockBadge
 * in AdminArtistsTab, source badges, genre chips, etc.).
 *
 * Props:
 *   label      (string)  — Display text (required)
 *   bg         (string)  — Background color, e.g. 'rgba(34,197,94,0.12)'
 *   color      (string)  — Text color, e.g. '#22c55e'
 *   size       (string)  — 'xs' | 'sm' | 'md' (default: 'sm')
 *   uppercase  (bool)    — Force uppercase text (default: true)
 *   style      (object)  — Additional inline style overrides
 *   className  (string)  — Additional CSS classes
 *   onClick    (func)    — Optional click handler
 *   children   (node)    — If provided, renders children instead of label
 */
export default function Badge({
  label,
  bg = 'rgba(136,136,136,0.08)',
  color = '#888',
  size = 'sm',
  uppercase = true,
  style = {},
  className = '',
  onClick,
  children,
}) {
  // Size presets matching existing codebase patterns
  const sizes = {
    xs: { fontSize: '8px',  padding: '1px 5px', borderRadius: '4px', letterSpacing: '0.3px' },
    sm: { fontSize: '10px', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.3px' },
    md: { fontSize: '12px', padding: '3px 10px', borderRadius: '8px', letterSpacing: '0.4px' },
  };

  const sizeConfig = sizes[size] || sizes.sm;

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
    textTransform: uppercase ? 'uppercase' : 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    background: bg,
    color: color,
    ...sizeConfig,
    ...(onClick ? { cursor: 'pointer' } : {}),
    ...style,
  };

  return (
    <span
      style={badgeStyle}
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {children || label}
    </span>
  );
}
