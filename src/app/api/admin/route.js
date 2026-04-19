import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds } from '@/lib/utils';
import { stripLockedFields } from '@/lib/writeGuards';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// ── Security Hard Stops ─────────────────────────────────────────────────────
// Light XSS sanitization for admin-authored free-text. Strips <script>,
// <iframe>, <style>, and inline on*= event handlers. This is not a full
// HTML sanitizer — the UI never renders admin strings as raw HTML — it's a
// defense-in-depth cap against copy-paste surprises and future renderers.
const BIO_MAX_LEN = 500;

function sanitizeString(v) {
  if (typeof v !== 'string') return v;
  return v
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function capBio(v) {
  const s = sanitizeString(v);
  if (typeof s !== 'string') return s;
  return s.slice(0, BIO_MAX_LEN);
}

function validateUrl(v) {
  if (typeof v !== 'string') return v;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

// GET events with pagination support
// Query params: page (1-based), limit (default 100), sort (column), order (asc/desc)
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
  const sort = searchParams.get('sort') || 'event_date';
  const order = searchParams.get('order') === 'desc' ? false : true; // ascending by default
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = getAdminClient();

  const triageFilter = searchParams.get('triage');
  const statusFilter = searchParams.get('status'); // 'upcoming' | 'past' | 'hidden'
  const missingTime = searchParams.get('missingTime') === 'true';
  const missingImage = searchParams.get('missingImage') === 'true';
  const recentlyAdded = searchParams.get('recentlyAdded') === 'true';
  // Strict Eastern-day date filter — used by the Spotlights admin tab so the
  // payload is ~30× smaller than the client-side filter it replaces.
  const dateFilter = searchParams.get('date'); // YYYY-MM-DD
  let dateStart = null;
  let dateEnd = null;
  if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    try {
      const bounds = getEasternDayBounds(dateFilter);
      dateStart = bounds.start;
      dateEnd = bounds.end;
    } catch { /* bad date → ignore filter */ }
  }

  const pageFrom = from;
  const pageTo = to;

  let query = supabase
    .from('events')
    .select('*, venues(name, address, color), artists(name, image_url, bio, genres, vibes), event_templates(template_name, bio, image_url, category, start_time, genres)')
    .order(sort, { ascending: order })
    .range(pageFrom, pageTo);

  // If triage=pending, only show un-reviewed events that the auto-sorter couldn't categorize
  if (triageFilter === 'pending') {
    query = query.eq('triage_status', 'pending');
    query = query.gte('event_date', new Date().toISOString());
  }

  // Server-side status filtering for Event Feed views
  //
  // IMPORTANT: when `dateFilter` is provided (Spotlight admin tab), the
  // `?status=upcoming` filter must NOT apply the `.gte(event_date, nowIso)`
  // time cutoff — we need ALL of that day's published events, including
  // ones whose start_time has already passed. Without this, an 8 PM show
  // at 9:51 PM vanishes from the Spotlight event list, the stale-pin
  // cleanup in useAdminSpotlight decides it's orphaned, and the cleanup
  // POST to /api/spotlight deletes the pin from the DB. This was the root
  // cause of 4 of 5 pins disappearing mid-evening.
  //
  // When `dateFilter` is absent, the Event Feed tab still gets the
  // traditional "future only" behavior — those consumers expect it.
  const nowIso = new Date().toISOString();
  if (statusFilter === 'upcoming') {
    query = query.eq('status', 'published');
    if (!dateFilter) {
      query = query.gte('event_date', nowIso);
    }
  } else if (statusFilter === 'past') {
    query = query.eq('status', 'published').lt('event_date', nowIso);
  } else if (statusFilter === 'hidden') {
    query = query.neq('status', 'published');
  }

  // Filter to events created in last 24h (for "New Events" click-through)
  if (recentlyAdded) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', since);
  }

  // Filter for missing time — uses boolean flag instead of UTC timestamp math
  if (missingTime) {
    query = query.eq('is_time_tbd', true);
  }

  // Filter for events missing ALL image sources (event-level columns only;
  // artist/template images are checked client-side in the waterfall).
  // An event is "missing image" when custom_image_url, event_image_url,
  // and legacy image_url are all null/empty.
  if (missingImage) {
    query = query.is('custom_image_url', null).is('event_image_url', null).is('image_url', null);
  }

  // Strict single-day Eastern filter (admin Spotlights tab).
  if (dateStart && dateEnd) {
    query = query.gte('event_date', dateStart).lte('event_date', dateEnd);
  }

  const { data, error } = await query;

  // ── Row-multiplication guard ─────────────────────────────────────────────
  // Context: dual-writing aliases into both artists.alias_names AND the
  // artist_aliases reverse-FK table can cause PostgREST to emit the same
  // event row multiple times when a future query embeds artist_aliases (or
  // when any reverse-FK embed is added downstream). We enforce the invariant
  // "1 row in events = 1 object in the returned JSON" by deduping on
  // events.id before pagination counts or slicing. This is a defensive O(n)
  // pass — on a clean base table it's a no-op.
  const seenIds = new Set();
  const filtered = [];
  for (const row of (data || [])) {
    if (!row?.id || seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    filtered.push(row);
  }

  // Compute count
  let count;
  let countQuery = supabase.from('events').select('id', { count: 'exact', head: true });
  if (statusFilter === 'upcoming') {
    countQuery = countQuery.eq('status', 'published');
    if (!dateFilter) countQuery = countQuery.gte('event_date', nowIso);
  } else if (statusFilter === 'past') {
    countQuery = countQuery.eq('status', 'published').lt('event_date', nowIso);
  }
  else if (statusFilter === 'hidden') countQuery = countQuery.neq('status', 'published');
  if (recentlyAdded) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    countQuery = countQuery.gte('created_at', since);
  }
  if (missingTime) countQuery = countQuery.eq('is_time_tbd', true);
  if (missingImage) countQuery = countQuery.is('custom_image_url', null).is('event_image_url', null).is('image_url', null);
  if (dateStart && dateEnd) countQuery = countQuery.gte('event_date', dateStart).lte('event_date', dateEnd);
  const countResult = await countQuery;
  count = countResult.count;

  const paginatedData = filtered;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Quick count: events created in last 24 hours (for dashboard velocity card)
  let newEvents24h = 0;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);
    newEvents24h = recentCount || 0;
  } catch { /* ignore */ }

  const total = count || 0;
  return NextResponse.json({
    events: paginatedData,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    newEvents24h,
  });
}

// CREATE event
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();

  // Auto-compute is_custom_metadata for new events
  const newHasCustom = !!(body.custom_bio || body.custom_genres?.length || body.custom_vibes?.length || body.custom_image_url);

  const { data, error } = await supabase
    .from('events')
    .insert({
      event_title: body.event_title || null,
      artist_name: body.artist_name,
      venue_id: body.venue_id || null,
      venue_name: body.venue_name,
      event_date: body.event_date,
      genre: body.genre || null,
      vibe: body.vibe || null,
      cover: body.cover || null,
      ticket_link: body.ticket_link || null,
      recurring: body.recurring || false,
      // NOTE: `is_spotlight` / `is_featured` retired Phase 5 — Spotlight
      // curation lives exclusively in the `spotlight_events` table.
      category: body.category || 'Live Music',
      triage_status: 'reviewed',
      status: body.status || 'published',
      source: body.source || 'Admin',
      event_image_url: validateUrl(body.event_image_url) || null,
      verified_at: new Date().toISOString(),
      // ── Custom metadata fields (Phase 3: Unified Visual CMS) ──────────────
      // Sanitized + length-capped (bio: 500 chars) + URL-validated before insert.
      custom_bio: body.custom_bio ? capBio(body.custom_bio) : null,
      custom_genres: body.custom_genres || null,
      custom_vibes: body.custom_vibes || null,
      custom_image_url: body.custom_image_url ? validateUrl(body.custom_image_url) : null,
      artist_bio: body.artist_bio ? capBio(body.artist_bio) : null,
      is_custom_metadata: newHasCustom,
    })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate live feed cache so new event appears immediately
  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json(data[0]);
}

// UPDATE event
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id } = body;

  // ── Bulk festival rename: update event_title across all matching events ────
  if (body.bulk_rename_festival) {
    const { old_name, new_name } = body;
    if (!old_name || !new_name) return NextResponse.json({ error: 'Missing old_name or new_name' }, { status: 400 });
    const { data, error } = await supabase
      .from('events')
      .update({ event_title: new_name, is_human_edited: true })
      .eq('event_title', old_name)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath('/');
    return NextResponse.json({ renamed: data?.length || 0 });
  }

  // ── Bulk festival delete: clear event_title from all matching events ───────
  if (body.bulk_clear_festival) {
    const { festival_name } = body;
    if (!festival_name) return NextResponse.json({ error: 'Missing festival_name' }, { status: 400 });
    const { data, error } = await supabase
      .from('events')
      .update({ event_title: null, is_festival: false, is_human_edited: true })
      .eq('event_title', festival_name)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath('/');
    return NextResponse.json({ cleared: data?.length || 0 });
  }

  // Only include known database columns — extra fields like event_time would cause PostgREST errors
  const updates = {
    ...(body.event_title !== undefined && { event_title: body.event_title || null }),
    ...(body.artist_name !== undefined && { artist_name: body.artist_name }),
    ...(body.artist_bio !== undefined && { artist_bio: body.artist_bio ? capBio(body.artist_bio) : null }),
    ...(body.venue_id !== undefined && { venue_id: body.venue_id || null }),
    ...(body.venue_name !== undefined && { venue_name: body.venue_name }),
    ...(body.event_date !== undefined && { event_date: body.event_date }),
    ...(body.genre !== undefined && { genre: body.genre || null }),
    ...(body.vibe !== undefined && { vibe: body.vibe || null }),
    ...(body.cover !== undefined && { cover: body.cover || null }),
    ...(body.ticket_link !== undefined && { ticket_link: body.ticket_link || null }),
    ...(body.recurring !== undefined && { recurring: body.recurring }),
    // `is_spotlight` / `is_featured` retired Phase 5. Silently ignored
    // if legacy clients still send them — we don't 400 to avoid breaking
    // in-flight deploys.
    ...(body.status !== undefined && { status: body.status }),
    ...(body.source !== undefined && { source: body.source }),
    ...(body.image_url !== undefined && { image_url: validateUrl(body.image_url) }),
    ...(body.event_image_url !== undefined && { event_image_url: body.event_image_url ? validateUrl(body.event_image_url) : null }),
    ...(body.category !== undefined && { category: body.category }),
    ...(body.triage_status !== undefined && { triage_status: body.triage_status }),
    // ── G Spot Protocol columns ─────────────────────────────────────────
    ...(body.is_category_verified !== undefined && { is_category_verified: !!body.is_category_verified }),
    ...(body.category_source !== undefined && { category_source: body.category_source }),
    ...(body.category_confidence !== undefined && { category_confidence: body.category_confidence }),
    ...(body.category_ai_flagged_at !== undefined && { category_ai_flagged_at: body.category_ai_flagged_at }),
    ...(body.artist_id !== undefined && { artist_id: body.artist_id }),
    // template_id: null clears a link (use case: "unlink from template"),
    // a UUID sets the "Safe Link" from the Discovery / Event Feed matchmaker UI.
    ...(body.template_id !== undefined && { template_id: body.template_id || null }),
    // ── Custom metadata fields (Phase 3: Unified Visual CMS) ──────────────
    // Security Hard Stops: bio → sanitize + 500-char cap; image_url → http(s) only.
    ...(body.custom_bio !== undefined && { custom_bio: body.custom_bio ? capBio(body.custom_bio) : null }),
    ...(body.custom_genres !== undefined && { custom_genres: body.custom_genres || null }),
    ...(body.custom_vibes !== undefined && { custom_vibes: body.custom_vibes || null }),
    ...(body.custom_image_url !== undefined && { custom_image_url: body.custom_image_url ? validateUrl(body.custom_image_url) : null }),
    // Always mark as human-edited on any admin save — protects from scraper overwrites
    is_human_edited: true,
    verified_at: new Date().toISOString(),
  };

  // Auto-compute is_custom_metadata flag: true if ANY custom_* field is populated
  const hasAnyCustom = !!(
    (body.custom_bio !== undefined ? body.custom_bio : null) ||
    (body.custom_genres !== undefined ? body.custom_genres?.length : null) ||
    (body.custom_vibes !== undefined ? body.custom_vibes?.length : null) ||
    (body.custom_image_url !== undefined ? body.custom_image_url : null)
  );
  // Only set the flag when the client sends at least one custom_* field
  const clientSendsCustom = body.custom_bio !== undefined ||
    body.custom_genres !== undefined ||
    body.custom_vibes !== undefined ||
    body.custom_image_url !== undefined;
  if (clientSendsCustom) {
    updates.is_custom_metadata = hasAnyCustom;
  }

  // ── Ghost Link → learning system ─────────────────────────────────────────
  // If the admin is linking this event to an artist (body.artist_id set to a
  // real UUID) AND the event's current artist_name differs from the target
  // artist's canonical name, append the ghost string to the target's
  // `alias_names` array. Future syncs will then auto-resolve this variant.
  //
  // Also mirror into the existing `artist_aliases` table so the sync
  // pipeline's alias_lower lookup keeps working (dual-write until we
  // consolidate to one store).
  let ghostLink = null;
  if (body.artist_id) {
    try {
      const [{ data: evRow }, { data: artRow }] = await Promise.all([
        supabase.from('events').select('artist_name, artist_id').eq('id', id).single(),
        supabase.from('artists').select('id, name, alias_names').eq('id', body.artist_id).single(),
      ]);
      const ghostName = (evRow?.artist_name || '').trim();
      const canonical = (artRow?.name || '').trim();
      const existingAliases = Array.isArray(artRow?.alias_names) ? artRow.alias_names : [];
      const existingLower = new Set(existingAliases.map(x => (x || '').toLowerCase().trim()));
      const isNewAlias =
        ghostName &&
        ghostName.toLowerCase() !== canonical.toLowerCase() &&
        !existingLower.has(ghostName.toLowerCase());

      if (isNewAlias) {
        const nextAliases = [...existingAliases, ghostName];
        await supabase
          .from('artists')
          .update({ alias_names: nextAliases })
          .eq('id', body.artist_id);

        // Mirror into artist_aliases (sync pipeline reads this)
        await supabase
          .from('artist_aliases')
          .upsert(
            { artist_id: body.artist_id, alias: ghostName, alias_lower: ghostName.toLowerCase() },
            { onConflict: 'alias_lower' }
          );

        ghostLink = { added_alias: ghostName, canonical_name: canonical };
      }
    } catch (err) {
      console.error('Ghost-link alias append failed (non-fatal):', err);
    }
  }

  // ── Verified-Lock write gate ─────────────────────────────────────────────
  // If the row is already human-edited, strip any field from `updates` that
  // would overwrite a locked value. This protects against automation
  // (enrichment crons, auto-categorize, sync-events) calling this PUT with
  // stale or null payloads and wiping admin-curated fields. A caller that
  // explicitly wants to overwrite a lock must POST an `is_human_edited`
  // JSONB with the field set to `false` (see stripLockedFields opts).
  //
  // We DO NOT strip if the caller is setting `is_human_edited: true` from
  // a manual admin save — in that case the write is itself the act of
  // locking, and the lock hasn't taken effect yet on the existing row.
  let safeUpdates = updates;
  try {
    const { data: existing } = await supabase
      .from('events')
      .select('is_human_edited')
      .eq('id', id)
      .single();
    if (existing) {
      safeUpdates = stripLockedFields(existing, updates, {
        allowUnlock: (body.is_human_edited && typeof body.is_human_edited === 'object')
          ? body.is_human_edited
          : null,
      });
    }
  } catch (err) {
    // Non-fatal — fall back to unguarded update rather than dropping the
    // write entirely. Logged for postmortem visibility.
    console.warn('Verified-Lock pre-read failed (update proceeding):', err.message);
  }

  const { data, error } = await supabase
    .from('events')
    .update(safeUpdates)
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Lifecycle cascade (audit H5, softened post-7:12 PM incident) ─────────
  // When an event is explicitly DELETED (status 'cancelled' or hard-delete
  // endpoints), drop its `spotlight_events` pins so the hero can't render
  // a dead row. But DO NOT cascade on transient status transitions that
  // happen during the event's spotlight window — archiving at 7:12 PM
  // while the show is live would yank Mariel off the hero mid-gig.
  //
  // Rule: only cascade when the new status is a terminal/destructive one
  // AND the pin's `spotlight_date` is strictly before today (Eastern).
  // Same-day pins are respected until the day rolls over — curators can
  // still clear them manually from the Spotlight tab.
  const DESTRUCTIVE_STATUSES = new Set(['cancelled', 'deleted', 'spam']);
  if (body.status !== undefined && DESTRUCTIVE_STATUSES.has(body.status)) {
    try {
      // Compute today's Eastern date string (YYYY-MM-DD). Pins dated today
      // or later survive; older pins get cleaned up.
      const todayET = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/New_York',
      });
      await supabase
        .from('spotlight_events')
        .delete()
        .eq('event_id', id)
        .lt('spotlight_date', todayET);
      revalidatePath('/api/spotlight');
    } catch (err) {
      // Non-fatal — the event update itself already succeeded.
      console.error('Spotlight cascade on status change failed:', err);
    }
  }

  // Invalidate live feed cache after any event update
  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json(ghostLink ? { ...data[0], ghost_link: ghostLink } : data[0]);
}

// DELETE event
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({ success: true });
}
