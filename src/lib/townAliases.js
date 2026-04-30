/**
 * Town aliases — Jersey Shore "social" town clusters.
 *
 * The Jersey Shore is dense with small municipalities that locals treat as
 * a single area. Belmar / Lake Como / Wall Township all share the same
 * boardwalk and bar scene; "Belmar" the search query should pull venues
 * physically in Lake Como too. Same story for Asbury Park ↔ Bradley Beach,
 * Manasquan ↔ Sea Girt ↔ Brielle, Spring Lake ↔ Spring Lake Heights.
 *
 * The Wall Township special case (member of three clusters):
 *   Wall Township has no ZIP code of its own — it shares ZIPs with
 *   neighboring boroughs, and each ZIP corresponds to a different post-
 *   office service area. Because mail delivery follows ZIP geography,
 *   a Wall venue's postal address always reads as one of those neighbor
 *   towns — never "Wall." That's why this map lists Wall Township in
 *   all three coastal clusters. It isn't arbitrary social mapping; it's
 *   literal postal geography.
 *
 *   ZIP → postal-town reference for venues physically in Wall Township:
 *
 *     07719  → Belmar             Eastern Wall (Rt 35, Belmar Blvd, Allenwood)
 *     07727  → Farmingdale        Western Wall (Rt 33, Farmingdale border)
 *     07731  → Howell             Northwestern Wall (Howell border, Gouldsboro)
 *     07753  → Neptune            Southern Wall (Rt 71, Shark River area)
 *     07762  → Spring Lake / SL Heights   Northeastern Wall (SL border, Allenwood)
 *     08724  → Brick              Coastal-southern Wall (Manasquan River area)
 *     08730  → Brielle            Easternmost coastal strip
 *     08736  → Manasquan          Manasquan-bordering coastal Wall
 *     08750  → Sea Girt           Sea Girt-bordering Wall
 *
 *   Practical consequence for admins: when a venue is physically in Wall
 *   Township, look at the ZIP code in its address — that ZIP's post-
 *   office town IS the cluster the venue belongs to. Set `venues.city`
 *   to that town. The decision is deterministic, not judgment-based.
 *   Examples already in production: Bakes Brewing, Bar Anticipation,
 *   Joe's Surf Shack — all physically Wall/Lake Como, all city=Belmar
 *   because their ZIP is 07719.
 *
 *   Future expansion candidates (no current venues, easy to add when
 *   we ingest one): Farmingdale, Howell, Neptune, Brick clusters. The
 *   Wall Township ZIP table covers the inland and Bayshore territories
 *   that today's coastal-focused myLocalJam doesn't reach yet.
 *
 * This map is consumed by:
 *   • src/app/page.js — home feed location filter (townOnly checkbox)
 *   • Future: search modal town dropdown, event detail "nearby venues"
 *
 * The data is local knowledge, not derivable from address parsing — admins
 * are the source of truth. Edit this file to add/adjust clusters.
 */

// Map keyed by canonical cluster name. Each cluster lists every member
// town that should match when the cluster is searched. The cluster name
// itself MUST appear in its own member list — that way a direct search
// for the cluster name still works through the same code path.
//
// Wall Township appears in three clusters intentionally. See note above.
export const TOWN_CLUSTERS = {
  'Belmar':       ['Belmar', 'Lake Como', 'Wall Township', 'Wall'],
  'Asbury Park':  ['Asbury Park', 'Bradley Beach'],
  'Manasquan':    ['Manasquan', 'Sea Girt', 'Brielle', 'Wall Township', 'Wall'],
  'Spring Lake':  ['Spring Lake', 'Spring Lake Heights', 'Wall Township', 'Wall'],
};

// Lower-cased lookup index built once at module load. Keys are lower-case
// town names; values are the array of cities that should match. Built so
// the per-call lookup is O(1) instead of O(N×M).
const CLUSTER_INDEX = (() => {
  const idx = new Map();

  // Step 1: index each cluster name → its full member list.
  for (const [cluster, members] of Object.entries(TOWN_CLUSTERS)) {
    idx.set(cluster.toLowerCase(), [...members]);
  }

  // Step 2: index each member town → union of all clusters it belongs to.
  // For single-membership towns this is just the one cluster. For Wall
  // Township (3 clusters) this is the deduped union of all members across
  // all three clusters — the "broad net" behavior described above.
  const memberToClusters = new Map();
  for (const [, members] of Object.entries(TOWN_CLUSTERS)) {
    for (const m of members) {
      const key = m.toLowerCase();
      if (!memberToClusters.has(key)) memberToClusters.set(key, new Set());
      members.forEach(other => memberToClusters.get(key).add(other));
    }
  }
  for (const [member, clusterSet] of memberToClusters.entries()) {
    // Don't overwrite cluster-name entries set in Step 1 (they're already
    // the canonical answer for that cluster's name).
    if (!idx.has(member)) idx.set(member, [...clusterSet]);
  }

  return idx;
})();

/**
 * Given a town name (cluster name OR member town), return the list of
 * city values to match against `venues.city`. Case-insensitive lookup.
 *
 * Examples (with current clusters):
 *   getTownCluster('Belmar')        → ['Belmar', 'Lake Como', 'Wall Township', 'Wall']
 *   getTownCluster('lake como')     → ['Belmar', 'Lake Como', 'Wall Township', 'Wall']
 *   getTownCluster('Wall Township') → 8-item union of all three clusters
 *   getTownCluster('Asbury Park')   → ['Asbury Park', 'Bradley Beach']
 *   getTownCluster('Long Branch')   → ['Long Branch']  (no cluster, literal pass-through)
 *   getTownCluster('')              → []
 *
 * The literal pass-through behavior matters: any town not in the cluster
 * map should still work as a search term — it just doesn't expand.
 */
export function getTownCluster(name) {
  if (!name || typeof name !== 'string') return [];
  const trimmed = name.trim();
  if (!trimmed) return [];
  const hit = CLUSTER_INDEX.get(trimmed.toLowerCase());
  if (hit) return hit;
  return [trimmed];
}

/**
 * Predicate helper — does the given venue city belong to the cluster
 * matched by the search input? Used inline in array filters where the
 * search term is the cluster reference and the city is each venue's
 * value. Case-insensitive on both sides.
 */
export function venueCityMatchesCluster(venueCity, searchInput) {
  if (!venueCity) return false;
  const cluster = getTownCluster(searchInput);
  if (cluster.length === 0) return false;
  const target = String(venueCity).trim().toLowerCase();
  return cluster.some(c => c.toLowerCase() === target);
}
