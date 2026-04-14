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

// POST /api/admin/ignored-names  Body: { name: string, reason?: string }
// Adds (or refreshes) a blacklist entry. Idempotent via name_lower upsert.
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const raw = (body?.name || '').trim();
  if (!raw) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const row = {
    name: raw,
    name_lower: raw.toLowerCase(),
    reason: (body?.reason || 'ghost_ignored').slice(0, 200),
  };

  const { data, error } = await supabase
    .from('ignored_artists')
    .upsert(row, { onConflict: 'name_lower' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
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
