/**
 * POST /api/admin/pending-enrichments/[id]/reject
 *
 * Marks a pending enrichment proposal as rejected. Does NOT touch the
 * artists table — the artist stays in whatever state it was in (typically
 * still bare). The admin can re-run bulk-enrich on the same artist later
 * to get a fresh proposal.
 *
 * Optional body: { notes?: string } — freeform context the admin wants to
 * record (e.g. "LLM hallucinated affiliation with wrong band"). Persists
 * on the queue row for the audit trail.
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function POST(request, { params }) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Pending enrichment id is required' }, { status: 400 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* body optional */
  }
  const notes = (body?.notes && typeof body.notes === 'string') ? body.notes.trim().slice(0, 500) : null;

  const supabase = getAdminClient();

  const updates = {
    status: 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewer: 'admin',
  };
  if (notes) updates.notes = notes;

  const { data, error } = await supabase
    .from('pending_enrichments')
    .update(updates)
    .eq('id', id)
    .eq('status', 'pending')  // guard against double-action
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Pending enrichment not found or already reviewed' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: data });
}
