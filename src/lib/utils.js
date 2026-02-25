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

export const GENRES = [
  'Rock', 'Indie', 'Blues', 'Jazz', 'Folk', 'Punk', 'Electronic',
  'R&B/Soul', 'Americana', 'Singer-Songwriter', 'Funk', 'Reggae',
  'Country', 'Hip-Hop', 'Cover Band',
];

export const VIBES = [
  '🔥 High Energy', '🎸 Rock', '🎷 Jazz & Blues', '🎵 Acoustic Chill',
  '🎤 Singer-Songwriter', '🎧 DJ / Electronic', '🎺 Funk & Soul',
  '🌊 Beach Vibes', '🎻 Folk & Americana',
];
