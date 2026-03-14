import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * POST /api/geocode-venues
 * Admin-only — geocodes all venues that have an address but no lat/lng.
 * Uses Nominatim (OpenStreetMap) for free geocoding.
 * Rate-limited to 1 request/second per Nominatim policy.
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();

  // Fetch venues missing coordinates
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, address')
    .is('latitude', null)
    .not('address', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!venues || venues.length === 0) {
    return NextResponse.json({ message: 'All venues already geocoded', updated: 0 });
  }

  const results = [];

  for (const venue of venues) {
    try {
      // Nominatim free geocoder — 1 req/sec rate limit
      const query = encodeURIComponent(venue.address);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
        { headers: { 'User-Agent': 'MyLocalJam/1.0 (contact@mylocaljam.com)' } }
      );
      const data = await res.json();

      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        const { error: updateErr } = await supabase
          .from('venues')
          .update({ latitude: lat, longitude: lng })
          .eq('id', venue.id);

        results.push({
          venue: venue.name,
          status: updateErr ? 'error' : 'geocoded',
          lat, lng,
          error: updateErr?.message,
        });
      } else {
        results.push({ venue: venue.name, status: 'not_found' });
      }

      // Rate limit: wait 1.1 seconds between requests
      await new Promise(r => setTimeout(r, 1100));
    } catch (err) {
      results.push({ venue: venue.name, status: 'error', error: err.message });
    }
  }

  return NextResponse.json({
    message: `Geocoded ${results.filter(r => r.status === 'geocoded').length} of ${venues.length} venues`,
    results,
  });
}

/**
 * GET /api/geocode-venues
 * Public — returns all venues with their coordinates (for client-side distance calc).
 */
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('venues')
    .select('id, name, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ venues: data || [] });
}
