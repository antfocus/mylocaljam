/**
 * Get UTC date boundaries for an Eastern (America/New_York) calendar day.
 * Handles EDT (UTC-4) and EST (UTC-5) automatically via Intl.
 *
 * Usage:
 *   const { start, end } = getEasternDayBounds('2026-03-20');
 *   query.gte('event_date', start).lt('event_date', end);
 *
 * An 8:30 PM Eastern show = T00:30 UTC next day. This function returns
 * UTC boundaries that cover the full Eastern calendar day.
 */
export function getEasternDayBounds(dateStr) {
  // Determine the offset for this date (EDT = -4, EST = -5)
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).formatToParts(probe);
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'EST';
  const offsetHours = tz.includes('EDT') ? 4 : 5;

  // Midnight Eastern in UTC = date + offsetHours
  const start = `${dateStr}T${String(offsetHours).padStart(2, '0')}:00:00Z`;

  // Next day midnight Eastern in UTC
  const next = new Date(probe);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextStr = next.toISOString().slice(0, 10);
  const end = `${nextStr}T${String(offsetHours).padStart(2, '0')}:00:00Z`;

  return { start, end, nextDateStr: nextStr, offsetHours };
}

/**
 * Convert a UTC ISO date string to an Eastern (America/New_York) date string (YYYY-MM-DD).
 * Use this instead of .slice(0, 10) which gives the UTC date.
 */
export function toEasternDateStr(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  } catch {
    return (isoDate || '').slice(0, 10);
  }
}

export function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(d) {
  const date = new Date(d);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function isToday(d) {
  return isSameDay(new Date(d), new Date());
}

export function isTomorrow(d) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(new Date(d), tomorrow);
}

export function isThisWeekend(d) {
  const date = new Date(d);
  const today = new Date();
  const day = today.getDay();

  // Find this coming Friday (or today if it's Fri/Sat/Sun)
  const friday = new Date(today);
  if (day === 0) { // Sunday
    friday.setDate(today.getDate() - 2);
  } else if (day === 6) { // Saturday
    friday.setDate(today.getDate() - 1);
  } else {
    friday.setDate(today.getDate() + (5 - day));
  }
  friday.setHours(0, 0, 0, 0);

  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);

  return date >= friday && date <= sunday;
}

export function getDateBadge(date) {
  if (isToday(date)) return { label: 'Today', className: 'bg-brand-accent' };
  if (isTomorrow(date)) return { label: 'Tomorrow', className: 'bg-blue-500' };
  if (isThisWeekend(date)) return { label: 'This Weekend', className: 'bg-purple-500' };
  return null;
}

// Venue color map
export const VENUE_COLORS = {
  'The Stone Pony': '#E84855',
  'House of Independents': '#3185FC',
  'The Wonder Bar': '#F9A620',
  'The Saint': '#23CE6B',
  'Asbury Lanes': '#A846A0',
  'Danny Clinch Transparent Gallery': '#FF6B6B',
};

export function getVenueColor(venueName) {
  return VENUE_COLORS[venueName] || '#FF6B35';
}

// Canonical allowed tags — these MUST match the AI system prompts in ai-lookup/route.js
// Controlled vocabulary: admin tag-pickers and AI output both constrained to these exact strings
export const GENRES = [
  'Rock / Alternative', 'Yacht Rock / Surf', 'R&B / Soul / Funk',
  'Country / Americana', 'Pop / Top 40', 'Acoustic / Singer-Songwriter',
  'Jazz / Blues', 'Reggae / Island', 'Jam / Psych',
  'Metal / Hardcore', 'Punk / Ska', 'Hip-Hop / Rap',
  'Electronic / DJ', 'Latin / World', 'Tributes / Covers',
];

export const VIBES = [
  'Outdoor / Patio', 'Family-Friendly',
  'High-Energy / Dance', 'Chill / Low-Key',
];

// ── New: clean time range formatting ─────────────────────────────────────────
// Accepts 24-hr strings ("19:00", "22:30"). Returns compact display strings:
//   "19:00", null       → "7p"
//   "19:00", "22:00"    → "7-10p"
//   "18:30", "22:00"    → "6:30-10p"
//   "14:00", "18:30"    → "2-6:30p"
//   "11:00", "14:00"    → "11a-2p"
export function formatTimeRange(startStr, endStr) {
  function parse(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return { h, m, period: h < 12 ? 'a' : 'p', h12: h % 12 || 12 };
  }
  function fmt(o, showPeriod) {
    const mins = o.m ? `:${String(o.m).padStart(2, '0')}` : '';
    return `${o.h12}${mins}${showPeriod ? o.period : ''}`;
  }
  const s = parse(startStr);
  if (!s) return '';
  // Treat midnight (00:00) as "no time provided" — don't display "12a"
  if (s.h === 0 && s.m === 0) return '';
  const e = parse(endStr);
  if (!e) return fmt(s, true);
  const samePeriod = s.period === e.period;
  return samePeriod
    ? `${fmt(s, false)}-${fmt(e, true)}`
    : `${fmt(s, true)}-${fmt(e, true)}`;
}

// ── New: group a sorted event array by date ───────────────────────────────────
// Returns [{ label: 'Today' | 'Tomorrow' | 'Fri Mar 7', date: 'YYYY-MM-DD', events: [] }]
export function groupEventsByDate(events) {
  const now       = new Date();
  const pad       = n => String(n).padStart(2, '0');
  const localStr  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today     = localStr(now);
  const tmrw      = new Date(now); tmrw.setDate(now.getDate() + 1);
  const tomorrow  = localStr(tmrw);
  const groups    = {};
  const order     = [];

  for (const event of events) {
    const d = (event.date || event.event_date || '').substring(0, 10);
    if (!groups[d]) { groups[d] = []; order.push(d); }
    groups[d].push(event);
  }

  return order.map(d => {
    let baseLabel;
    if (d === today)         baseLabel = 'Today';
    else if (d === tomorrow)  baseLabel = 'Tomorrow';
    else                     baseLabel = null;

    let dateFull = '';
    try {
      dateFull = new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      }).toUpperCase();
    } catch { dateFull = d; }

    const label = baseLabel
      ? `${baseLabel.toUpperCase()} \u00b7 ${dateFull}`
      : dateFull;

    return { label, date: d, events: groups[d] };
  });
}
