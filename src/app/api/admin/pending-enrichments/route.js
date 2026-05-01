/**
 * GET /api/admin/pending-enrichments?status=pending&limit=50
 *
 * Returns the enrichment review queue with each pending row joined to its
 * current artist state, so the admin UI can render side-by-side
 * current-vs-proposed without a second fetch.
 *
 * Powers the Queue sub-tab inside AdminEnrichmentTab. Default status
 * filter is 'pending'; admin can toggle to 'rejected' / 'error' to audit
 * past decisions or retry failed proposals.
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'archived', 'error']);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || 'pending').toLowerCase();
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${[...ALLOWED_STATUSES].join(', ')}` },
      { status: 400 }
    );
  }

  let limit = parseInt(searchParams.get('limit'), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const supabase = getAdminClient();

  // Pull the queue + the joined artist row's current state. The frontend
  // uses the artist data to render the "current" column of the side-by-side
  // comparison; the proposed_* columns drive the "proposed" column.
  const { data, error } = await supabase
    .from('pending_enrichments')
    .select(`
      id, artist_id, status, source, llm_model,
      proposed_bio, proposed_image_url, proposed_image_candidates,
      proposed_genres, proposed_vibes, proposed_kind, proposed_is_tribute,
      bio_source, image_source,
      error_message, notes,
      created_at, reviewed_at, reviewer,
      artists (
        id, name, bio, image_url, genres, vibes, kind, is_tribute,
        is_locked, is_human_edited, image_candidates
      )
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[pending-enrichments]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data || [],
    total: (data || []).length,
    status,
  });
}
