import { NextResponse } from 'next/server';

/**
 * POST /api/admin/venues/image-search
 * Body: { name: string, city?: string }
 * Returns: { candidates: [{ url, thumbnail, sourceDomain, source, width, height, title }] }
 *
 * Server-side proxy to Serper's Google Images search. Used by the Admin
 * Venues Directory edit modal — the "Find images" button fires this with
 * the venue's name + city to surface 6 candidate photos the admin can
 * pick from.
 *
 * Why server-side:
 *   • SERPER_API_KEY stays in the server env, never reaches the client.
 *   • Same auth gate the rest of /api/admin/* uses — no public proxy.
 *   • One place to filter junk results before paying the round-trip cost
 *     on the client.
 *   • Easy place to swap to Google CSE or Bing later without touching
 *     the UI.
 *
 * Filtering rules applied to each Serper result before it makes the cut:
 *   • Must have an https:// imageUrl (no data: URIs, no http:// — modern
 *     browsers block mixed content on the admin's HTTPS origin).
 *   • imageWidth ≥ 300 (anything smaller is a favicon or social-profile
 *     thumb, useless as a venue header).
 *   • Hostname must NOT match the unstable-host deny-list. See the list
 *     below — these are CDNs whose URLs reliably break within weeks
 *     (Google Images thumbnail cache, Facebook CDN, Instagram CDN, etc.).
 *     Saving an unstable URL to venues.photo_url means the admin will
 *     fix the same venue twice. Hard-reject at search time.
 *   • De-dup by URL so we don't show the same image twice.
 *
 * Returns up to 6 candidates — enough variety for the admin to pick a
 * good one, few enough to render comfortably as thumbnails inside the
 * edit modal without cluttering the form.
 *
 * Long-term plan: image curation Phase 1 (PARKED #2) will mirror chosen
 * images to Supabase Storage so the lifetime is fully under our control.
 * Until that ships, this deny-list is the second-best defense.
 */

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

const MAX_CANDIDATES = 6;
const MIN_IMAGE_WIDTH = 300;

// Deny-list of CDN hosts known to expire / require auth / block hotlinks.
// Matched as a substring of the hostname (so subdomains catch too —
// scontent-iad3-1.cdninstagram.com, etc.). Conservative: only entries
// I'm confident WILL break. Yelp, Tripadvisor, Squarespace, Wix all stay
// out of this list because their CDNs are stable for the duration the
// venue website itself is up.
const UNSTABLE_HOST_PATTERNS = [
  'fbcdn.net',           // Facebook CDN — auth-token URLs, expire
  'cdninstagram.com',    // Instagram CDN — same problem
  'lookaside.fbsbx.com', // Facebook external storage — frequent breakage
  'gstatic.com',         // Google Images thumbnail cache — weeks at most
  'googleusercontent.com', // Google content CDN — short-lived
  'bing.net',            // Bing thumbnail cache
  'duckduckgo.com',      // DuckDuckGo image proxy — short-lived
  'pinimg.com',          // Pinterest CDN — frequent breakage
];

// Extract a clean source domain (e.g. "tenthavenueburrito.com") from a
// URL for display next to each candidate. Strips "www." prefix so the
// chip shown to the admin is short. Falls back to the raw hostname on
// parse failure — never returns null, so the UI doesn't have to guard.
function getSourceDomain(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return 'unknown';
  }
}

function isUnstableHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return UNSTABLE_HOST_PATTERNS.some(pat => host.includes(pat));
  } catch {
    return true; // Couldn't parse → can't trust → reject
  }
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Image search not configured' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body?.name || '').trim();
  const city = (body?.city || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Build the search query. Adding "NJ" disambiguates against same-named
  // venues elsewhere (e.g., a "Wonder Bar" in another state). Adding
  // "venue" or "bar" steers Serper toward establishment shots rather
  // than menu photos or unrelated stock images.
  const queryParts = [name];
  if (city) queryParts.push(city);
  queryParts.push('NJ');
  const q = queryParts.join(' ');

  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q, num: 20 }),  // Over-fetch so filtering still leaves enough
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Image search returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawImages = Array.isArray(data?.images) ? data.images : [];

    // Filter + dedupe + cap. Keep the order Serper returned (relevance-ranked).
    const seen = new Set();
    const candidates = [];
    let rejectedUnstable = 0;
    for (const img of rawImages) {
      if (candidates.length >= MAX_CANDIDATES) break;
      const url = img?.imageUrl;
      if (!url || typeof url !== 'string' || !url.startsWith('https://')) continue;
      if (seen.has(url)) continue;
      if (isUnstableHost(url)) { rejectedUnstable++; continue; }
      const width = Number(img?.imageWidth) || 0;
      if (width > 0 && width < MIN_IMAGE_WIDTH) continue;
      seen.add(url);
      candidates.push({
        url,
        thumbnail: img?.thumbnailUrl || url,
        sourceDomain: getSourceDomain(url),
        source: img?.source || null,
        width: width || null,
        height: Number(img?.imageHeight) || null,
        title: img?.title || null,
      });
    }

    return NextResponse.json({
      candidates,
      query: q,
      // Surfaced for the UI to show "X results filtered out as unstable"
      // if the admin wants context for why fewer than 6 candidates returned.
      rejectedUnstable,
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'Image search timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
