import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Whitelist of columns the admin form is allowed to write. Everything
// else (id, color, created_at) is managed by the DB or kept at defaults.
// Listed here once so POST and PUT share the same shape.
const EDITABLE_FIELDS = [
  'name', 'address', 'city', 'slug',
  'latitude', 'longitude',
  'website', 'photo_url',
  'venue_type', 'tags',
  'default_start_time',
];

// Sanitize incoming payload to whitelist + normalize types. Returns a
// plain object safe to pass to Supabase. Unknown keys are silently dropped.
function sanitize(input) {
  const out = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in input)) continue;
    let val = input[key];
    if (typeof val === 'string') val = val.trim();
    // Empty string → null for nullable columns
    if (val === '') val = null;
    // Tags must be an array; reject anything else
    if (key === 'tags') {
      if (!Array.isArray(val)) val = [];
      val = val.map(t => String(t).trim()).filter(Boolean);
    }
    // Numeric coords — allow null, otherwise coerce to number
    if ((key === 'latitude' || key === 'longitude') && val != null) {
      const n = Number(val);
      val = Number.isFinite(n) ? n : null;
    }
    out[key] = val;
  }
  return out;
}

/**
 * POST /api/admin/venues
 * Create a venue row. Accepts the full editable payload.
 * The legacy {name, address}-only quick-create from the queue triage card
 * is still supported because all other fields are optional and default to
 * null. Returns the created venue row.
 */
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

  const payload = sanitize(body);
  if (!payload.name) {
    return NextResponse.json({ error: 'Venue name is required' }, { status: 400 });
  }

  // Validate time format if provided
  if (payload.default_start_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(payload.default_start_time)) {
    return NextResponse.json({ error: 'Invalid time format. Use HH:MM' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Duplicate check on name (case-insensitive). Existing venue is returned
  // in the 409 body so the queue triage card can offer "use existing".
  const { data: existing } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', payload.name)
    .limit(1);

  if (existing?.length > 0) {
    return NextResponse.json(
      { error: `Venue "${existing[0].name}" already exists`, venue: existing[0] },
      { status: 409 }
    );
  }

  const { data: venue, error } = await supabase
    .from('venues')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(venue);
}

/**
 * PUT /api/admin/venues
 * Update a venue row. Body must include `id` plus any editable fields.
 * Backwards-compatible with the legacy default_start_time-only payload
 * shipped before the Directory sub-tab.
 */
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: 'Venue id is required' }, { status: 400 });
  }

  const updates = sanitize(body);

  // Validate time format if provided
  if (updates.default_start_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(updates.default_start_time)) {
    return NextResponse.json({ error: 'Invalid time format. Use HH:MM' }, { status: 400 });
  }

  // If name is being changed, ensure it doesn't collide with another row.
  if (updates.name) {
    const supabase = getAdminClient();
    const { data: dup } = await supabase
      .from('venues')
      .select('id, name')
      .ilike('name', updates.name)
      .neq('id', id)
      .limit(1);
    if (dup?.length > 0) {
      return NextResponse.json(
        { error: `Another venue named "${dup[0].name}" already exists` },
        { status: 409 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { data: venue, error } = await supabase
    .from('venues')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(venue);
}

/**
 * DELETE /api/admin/venues?id=UUID
 * Hard delete with FK pre-check. If any events, event_templates, or
 * event_series rows reference the venue, returns 409 with the counts
 * so the admin can reassign or delete those before retrying. No soft
 * delete column exists today; preserving referential integrity at the
 * API layer is the safety net.
 */
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Venue id is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // FK pre-check — three tables can reference venues. Counts are head:
  // true so we don't transfer rows we're not going to inspect.
  const [eventsRes, templatesRes, seriesRes] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('venue_id', id),
    supabase.from('event_templates').select('id', { count: 'exact', head: true }).eq('venue_id', id),
    supabase.from('event_series').select('id', { count: 'exact', head: true }).eq('venue_id', id),
  ]);
  const eventsCount = eventsRes.count || 0;
  const templatesCount = templatesRes.count || 0;
  const seriesCount = seriesRes.count || 0;

  if (eventsCount + templatesCount + seriesCount > 0) {
    return NextResponse.json({
      error: 'Venue is referenced by other rows',
      fkBlocked: true,
      events: eventsCount,
      templates: templatesCount,
      series: seriesCount,
    }, { status: 409 });
  }

  const { error } = await supabase.from('venues').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
