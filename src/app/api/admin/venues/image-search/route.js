import { NextResponse } from 'next/server';

/**
 * POST /api/admin/venues/image-search
 * Body: { name: string, city?: string }
 * Returns: { candidates: [{ url, thumbnail, source, width, height, title }] }
 *
 * Server-side proxy to Serper's Google Images search. Used by the Admin
 * Venues Directory edit modal — the "Find images" button fires this with
 * the venue's name + city to surface 6 candidate photos the admin can
 * pick from.
 *
 * Why server-side:
 *   • SERPER_API_KEY stays in the server env, never reaches the client.
 *   • Same auth gate the rest of /api/admin/* uses — no public proxy.
 *   • One place to filter junk results (tiny thumbnails, data URIs, dead
 *     hosts) before paying the round-trip cost on the client.
 *   • Easy place to swap to Google CSE or Bing later without touching
 *     the UI.
 *
 * Filtering rules applied to each Serper result before it makes the cut:
 *   • Must have an https:// imageUrl (no data: URIs, no http:// — modern
 *     browsers block mixed content on the admin's HTTPS origin).
 *   • imageWidth ≥ 300 (anything smaller is a favicon or social-profile
 *     thumb, useless as a venue header).
 *   • De-dup by URL so we don't show the same image twice.
 *
 * Returns up to 6 candidates — enough variety for the admin to pick a
 * good one, few enough to render comfortably in a 3-column thumbnail
 * row inside the edit modal without cluttering the form.
 */

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

const MAX_CANDIDATES = 6;
const MIN_IMAGE_WIDTH = 300;

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
    for (const img of rawImages) {
      if (candidates.length >= MAX_CANDIDATES) break;
      const url = img?.imageUrl;
      if (!url || typeof url !== 'string' || !url.startsWith('https://')) continue;
      if (seen.has(url)) continue;
      const width = Number(img?.imageWidth) || 0;
      if (width > 0 && width < MIN_IMAGE_WIDTH) continue;
      seen.add(url);
      candidates.push({
        url,
        thumbnail: img?.thumbnailUrl || url,
        source: img?.source || null,
        width: width || null,
        height: Number(img?.imageHeight) || null,
        title: img?.title || null,
      });
    }

    return NextResponse.json({ candidates, query: q });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'Image search timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
