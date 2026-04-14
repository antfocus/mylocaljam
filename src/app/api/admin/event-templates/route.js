import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Explicit column allowlist — never spread raw request body into Supabase.
// Mirrors the rule established in src/app/api/admin/route.js PUT handler.
const ALLOWED_COLUMNS = [
  'template_name',
  'aliases',
  'category',
  'venue_id',
  'is_event_only',
  'image_url',
  'bio',
  'genres',
  'vibes',
  'image_source',
  'bio_source',
  'field_status',
  'is_human_edited',
  'is_locked',
  'start_time',
];

const LOCKABLE_FIELDS = ['template_name', 'bio', 'genres', 'vibes', 'image_url', 'aliases', 'category', 'start_time'];

function pickAllowed(body) {
  const out = {};
  for (const col of ALLOWED_COLUMNS) {
    if (body[col] !== undefined) out[col] = body[col];
  }
  return out;
}

// GET all event templates (with optional search + needsInfo filter)
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const needsInfo = searchParams.get('needsInfo') === 'true';

  let query = supabase
    .from('event_templates')
    .select('*')
    .order('template_name', { ascending: true })
    .limit(5000);

  if (search.trim()) {
    query = query.ilike('template_name', `%${search.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let results = data || [];

  // Filter to templates missing at least one key field
  if (needsInfo) {
    results = results.filter(t =>
      !t.bio ||
      !t.image_url ||
      (!t.genres || t.genres.length === 0)
    );
  }

  // Attach `_event_count` — how many times each template_name (or alias)
  // appears in the live `events` feed. Enables "Sort by Frequency" in the
  // admin UI and lets callers see at a glance which templates are actively
  // recurring. Counted case-insensitively against name + aliases.
  try {
    // `events` stores the event name in `event_title` (confirmed Staging + Prod).
    const { data: events } = await supabase
      .from('events')
      .select('event_title')
      .not('event_title', 'is', null)
      .limit(10000);

    const counts = new Map();
    for (const row of events || []) {
      const key = (row?.event_title || '').trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    results = results.map(t => {
      let count = 0;
      if (t.template_name) {
        count += counts.get(t.template_name.trim().toLowerCase()) || 0;
      }
      if (Array.isArray(t.aliases)) {
        for (const a of t.aliases) {
          if (!a) continue;
          count += counts.get(String(a).trim().toLowerCase()) || 0;
        }
      }
      return { ...t, _event_count: count };
    });
  } catch {
    // Non-fatal — templates list still renders without counts.
    results = results.map(t => ({ ...t, _event_count: 0 }));
  }

  return NextResponse.json(results);
}

// CREATE event template
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();

  const insertPayload = pickAllowed(body);

  if (!insertPayload.template_name) {
    return NextResponse.json({ error: 'template_name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('event_templates')
    .insert(insertPayload)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}

// UPDATE event template
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing template id' }, { status: 400 });
  }

  const updates = pickAllowed(body);

  // Backend lock validation: strip any fields that are locked via is_human_edited.
  // Mirrors the artists PUT handler — prevents locked fields from being overwritten
  // even if the frontend is bypassed.
  const { data: existing } = await supabase
    .from('event_templates')
    .select('is_human_edited')
    .eq('id', id)
    .single();

  if (existing?.is_human_edited && typeof existing.is_human_edited === 'object') {
    const locks = existing.is_human_edited;
    for (const field of LOCKABLE_FIELDS) {
      if (locks[field] && updates[field] !== undefined) {
        const incomingLocks = updates.is_human_edited;
        const isUnlocking = incomingLocks && typeof incomingLocks === 'object' && !incomingLocks[field];
        if (!isUnlocking) {
          delete updates[field];
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('event_templates')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json(data[0]);
}

// DELETE event template
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing template id' }, { status: 400 });
  }

  const { data: template, error: fetchErr } = await supabase
    .from('event_templates')
    .select('template_name')
    .eq('id', id)
    .single();

  if (fetchErr || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('event_templates')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({ success: true, template_name: template.template_name });
}
