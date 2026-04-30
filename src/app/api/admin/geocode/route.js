import { NextResponse } from 'next/server';

/**
 * POST /api/admin/geocode
 * Body: { address: string }
 * Returns: { latitude, longitude, display_name }
 *
 * Server-side proxy to Nominatim (OpenStreetMap's free geocoder). Used by
 * the Admin Venues Directory edit modal — the "Geocode from address" button
 * fires this when an admin needs lat/lng for a venue that has an address
 * but no coordinates.
 *
 * Why server-side instead of calling Nominatim directly from the client:
 *   • Lets us set a proper User-Agent (Nominatim's usage policy requires it
 *     and silently throttles requests without one).
 *   • Keeps the admin's IP off Nominatim's logs.
 *   • Easy place to swap the geocoder later (Mapbox, Google) without
 *     touching the UI.
 *   • Auth gate so the endpoint isn't a public proxy.
 *
 * Nominatim usage policy notes:
 *   • Free, no API key.
 *   • Rate limit: 1 request/sec average. The admin tab clicks one venue
 *     at a time, so we don't need application-level throttling.
 *   • User-Agent must identify the application; "anonymous" headers get
 *     blocked.
 */

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const address = (body?.address || '').trim();
  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      addressdetails: '0',
      // Bias to US results — every myLocalJam venue is in NJ. Keeps
      // Nominatim from returning a same-named street in another country.
      countrycodes: 'us',
    })}`;

    const res = await fetch(url, {
      headers: {
        // Required by Nominatim usage policy. Identify the application
        // and a contact so they can reach out before throttling/blocking.
        'User-Agent': 'myLocalJam-admin/1.0 (https://mylocaljam.com)',
        'Accept': 'application/json',
      },
      // Reasonable timeout — Nominatim is usually fast but can be slow
      // under load. 8s is enough for the admin to wait without UI death.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Geocoder returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'No match found for that address' },
        { status: 404 }
      );
    }

    const { lat, lon, display_name } = data[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: 'Geocoder returned invalid coordinates' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      latitude,
      longitude,
      display_name: display_name || null,
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'Geocoder timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
