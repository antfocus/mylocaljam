import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * Ignored-names (Ghost Hunt Blacklist) CRUD.
 *
 * Backed by the `ignored_artists` table — same store the artist DELETE path
 * writes to. That way both "Delete artist" and "Ignore ghost" contribute to
 * one blacklist, and the Ghost Hunt audit query can filter against a single
 * source of truth.
 */

// GET /api/admin/ignored-names → list blacklist, most-recent first
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('ignored_artists')
    .select('id, name, name_lower, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST /api/admin/ignored-names
//   Single: Body: { name: string, reason?: string }
//   Batch : Body: { names: string[], reason?: string }
// Adds (or refreshes) blacklist entries. Idempotent via name_lower upsert.
// Batch mode lets the admin UI "Ignore Selected" without N round-trips.
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const reason = (body?.reason || 'ghost_ignored').slice(0, 200);

  // Accept either `name` (single) or `names[]` (batch), and normalize to a
  // deduped list keyed by lowercased+trimmed form. Blank entries are dropped.
  const rawList = Array.isArray(body?.names)
    ? body.names
    : (body?.name ? [body.name] : []);
  const seen = new Set();
  const rows = [];
  for (const entry of rawList) {
    const t = typeof entry === 'string' ? entry.trim() : '';
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ name: t, name_lower: k, reason });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'name or names[] is required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('ignored_artists')
    .upsert(rows, { onConflict: 'name_lower' })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Single-item callers get the row object; batch callers get the array.
  if (!Array.isArray(body?.names)) {
    return NextResponse.json(data?.[0] || null);
  }
  return NextResponse.json({ success: true, inserted: data?.length || 0, rows: data });
}

// DELETE /api/admin/ignored-names?id=<uuid>  OR  ?name=<string>
// Removes a blacklist entry (admin change-of-mind / false positive).
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const name = searchParams.get('name');

  if (!id && !name) {
    return NextResponse.json({ error: 'id or name is required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  let query = supabase.from('ignored_artists').delete();
  if (id) {
    query = query.eq('id', id);
  } else {
    query = query.eq('name_lower', name.trim().toLowerCase());
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
