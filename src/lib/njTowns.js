/**
 * NJ Shore + nearby towns reference list for location autocomplete.
 *
 * Why this exists: Nominatim's relevance ranking is unreliable for short
 * queries. Typing "as" returns Lindenwold instead of Asbury Park; "be"
 * surfaces random places before Belmar. We can't fix Nominatim, but we
 * can prefix-match a curated list locally and surface those FIRST,
 * with Nominatim results appended for the long tail.
 *
 * Coordinates are approximate town centroids (good enough for a
 * radius-based event filter). Don't hand-type more than 2 decimals
 * unless you've verified them.
 *
 * Add new towns liberally — the cost of a false-positive prefix match
 * is one extra item in a 5-item dropdown.
 */

export const NJ_TOWNS = [
  // Monmouth County (the heart of the Jersey Shore for live music)
  { name: 'Allenhurst', lat: 40.2367, lng: -74.0024 },
  { name: 'Asbury Park', lat: 40.2204, lng: -74.0121 },
  { name: 'Atlantic Highlands', lat: 40.4123, lng: -74.0382 },
  { name: 'Avon-by-the-Sea', lat: 40.1909, lng: -74.0157 },
  { name: 'Belmar', lat: 40.1784, lng: -74.0218 },
  { name: 'Bradley Beach', lat: 40.2018, lng: -74.0124 },
  { name: 'Brielle', lat: 40.1057, lng: -74.0590 },
  { name: 'Colts Neck', lat: 40.2918, lng: -74.1718 },
  { name: 'Deal', lat: 40.2526, lng: -73.9971 },
  { name: 'Eatontown', lat: 40.2962, lng: -74.0518 },
  { name: 'Fair Haven', lat: 40.3612, lng: -74.0382 },
  { name: 'Farmingdale', lat: 40.1989, lng: -74.1696 },
  { name: 'Freehold', lat: 40.2599, lng: -74.2735 },
  { name: 'Hazlet', lat: 40.4179, lng: -74.1721 },
  { name: 'Highlands', lat: 40.4040, lng: -74.0021 },
  { name: 'Holmdel', lat: 40.3598, lng: -74.1782 },
  { name: 'Howell', lat: 40.1773, lng: -74.2057 },
  { name: 'Keansburg', lat: 40.4429, lng: -74.1304 },
  { name: 'Keyport', lat: 40.4334, lng: -74.1995 },
  { name: 'Lake Como', lat: 40.1715, lng: -74.0282 },
  { name: 'Little Silver', lat: 40.3354, lng: -74.0440 },
  { name: 'Long Branch', lat: 40.3043, lng: -73.9924 },
  { name: 'Manalapan', lat: 40.2962, lng: -74.3471 },
  { name: 'Manasquan', lat: 40.1262, lng: -74.0488 },
  { name: 'Marlboro', lat: 40.3148, lng: -74.2465 },
  { name: 'Matawan', lat: 40.4148, lng: -74.2293 },
  { name: 'Middletown', lat: 40.3962, lng: -74.0926 },
  { name: 'Monmouth Beach', lat: 40.3334, lng: -73.9824 },
  { name: 'Neptune', lat: 40.2009, lng: -74.0287 },
  { name: 'Neptune City', lat: 40.1948, lng: -74.0321 },
  { name: 'Ocean Grove', lat: 40.2118, lng: -74.0079 },
  { name: 'Oceanport', lat: 40.3173, lng: -74.0188 },
  { name: 'Point Pleasant', lat: 40.0834, lng: -74.0682 },
  { name: 'Point Pleasant Beach', lat: 40.0918, lng: -74.0457 },
  { name: 'Red Bank', lat: 40.3473, lng: -74.0643 },
  { name: 'Rumson', lat: 40.3690, lng: -74.0010 },
  { name: 'Sea Bright', lat: 40.3618, lng: -73.9740 },
  { name: 'Sea Girt', lat: 40.1295, lng: -74.0335 },
  { name: 'Shrewsbury', lat: 40.3284, lng: -74.0610 },
  { name: 'Spring Lake', lat: 40.1534, lng: -74.0288 },
  { name: 'Spring Lake Heights', lat: 40.1534, lng: -74.0382 },
  { name: 'Tinton Falls', lat: 40.3018, lng: -74.0993 },
  { name: 'Wall Township', lat: 40.1690, lng: -74.0810 },
  { name: 'West Long Branch', lat: 40.2903, lng: -74.0157 },

  // Ocean County (south of Manasquan Inlet)
  { name: 'Bay Head', lat: 40.0729, lng: -74.0521 },
  { name: 'Beach Haven', lat: 39.5618, lng: -74.2424 },
  { name: 'Brick', lat: 40.0590, lng: -74.1099 },
  { name: 'Forked River', lat: 39.8348, lng: -74.1857 },
  { name: 'Island Heights', lat: 39.9445, lng: -74.1496 },
  { name: 'Jackson', lat: 40.1062, lng: -74.3651 },
  { name: 'Lacey', lat: 39.8698, lng: -74.2243 },
  { name: 'Lakewood', lat: 40.0965, lng: -74.2179 },
  { name: 'Lavallette', lat: 39.9695, lng: -74.0696 },
  { name: 'Long Beach Island', lat: 39.6473, lng: -74.1857 },
  { name: 'Mantoloking', lat: 40.0395, lng: -74.0529 },
  { name: 'Ocean Township', lat: 40.2376, lng: -74.0518 },
  { name: 'Seaside Heights', lat: 39.9445, lng: -74.0735 },
  { name: 'Seaside Park', lat: 39.9265, lng: -74.0796 },
  { name: 'Ship Bottom', lat: 39.6418, lng: -74.1840 },
  { name: 'Stafford', lat: 39.6890, lng: -74.2496 },
  { name: 'Toms River', lat: 39.9537, lng: -74.1979 },

  // Other major NJ — broader coverage so people can search beyond the shore
  { name: 'Atlantic City', lat: 39.3643, lng: -74.4229 },
  { name: 'Bayonne', lat: 40.6687, lng: -74.1143 },
  { name: 'Cape May', lat: 38.9351, lng: -74.9060 },
  { name: 'Cherry Hill', lat: 39.9348, lng: -75.0307 },
  { name: 'Clifton', lat: 40.8584, lng: -74.1638 },
  { name: 'Edison', lat: 40.5187, lng: -74.4121 },
  { name: 'Elizabeth', lat: 40.6640, lng: -74.2107 },
  { name: 'Hoboken', lat: 40.7440, lng: -74.0324 },
  { name: 'Jersey City', lat: 40.7178, lng: -74.0431 },
  { name: 'Montclair', lat: 40.8259, lng: -74.2090 },
  { name: 'Morristown', lat: 40.7968, lng: -74.4815 },
  { name: 'New Brunswick', lat: 40.4862, lng: -74.4518 },
  { name: 'Newark', lat: 40.7357, lng: -74.1724 },
  { name: 'Ocean City', lat: 39.2776, lng: -74.5746 },
  { name: 'Paterson', lat: 40.9168, lng: -74.1718 },
  { name: 'Princeton', lat: 40.3573, lng: -74.6672 },
  { name: 'Somerville', lat: 40.5743, lng: -74.6094 },
  { name: 'Trenton', lat: 40.2206, lng: -74.7597 },
  { name: 'Wildwood', lat: 38.9912, lng: -74.8154 },
];

/**
 * Prefix-match towns against a query. Returns up to `limit` matches,
 * prefix-first then substring-second, alphabetical within each tier.
 *
 * Returns objects shaped to match what the autocomplete dropdown expects:
 *   { name: 'Asbury Park, NJ', lat, lng, _townLower, _local: true }
 */
export function matchNjTowns(query, limit = 5) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const prefix = [];
  const substring = [];
  for (const t of NJ_TOWNS) {
    const lower = t.name.toLowerCase();
    if (lower.startsWith(q)) prefix.push(t);
    else if (lower.includes(q)) substring.push(t);
  }
  prefix.sort((a, b) => a.name.localeCompare(b.name));
  substring.sort((a, b) => a.name.localeCompare(b.name));

  return [...prefix, ...substring].slice(0, limit).map(t => ({
    name: `${t.name}, NJ`,
    lat: t.lat,
    lng: t.lng,
    full: `${t.name}, New Jersey, USA`,
    _townLower: t.name.toLowerCase(),
    _local: true,
  }));
}
