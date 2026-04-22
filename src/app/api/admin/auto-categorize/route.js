import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';
// Shared classifier — single source of truth for the prompt, enum allow-list,
// and confidence threshold. Also imported by sync-events for the AI fallback
// step so the admin "AI Categorize" button and the automatic sync-time pass
// can never drift apart.
import { classifyEvent, ALLOWED_CATEGORIES, CONFIDENCE_THRESHOLD } from '@/lib/eventClassifier';

/**
 * POST /api/admin/auto-categorize
 *   Body: { eventIds: string[] }
 *
 * G Spot Protocol — AI event categorization.
 *
 *   1. Batching     — accepts an array of event IDs, processes each in turn.
 *   2. Safety       — skips events where `is_category_verified` is true OR
 *                     `template_id` is set (template-linked events already
 *                     inherit a category via the waterfall — Chain of Command
 *                     is Templates > Artists > AI > Default).
 *   3. Strict enums — AI output is whitelisted against ALLOWED_CATEGORIES.
 *                     Anything else is dropped.
 *   4. Confidence   — minimum 0.85. Below that the row is flagged for
 *                     Manual Review (category_ai_flagged_at = now, source =
 *                     'manual_review') and the category itself is NOT
 *                     overwritten.
 *
 * The handler never writes `is_category_verified = true`. Only humans do
 * that — via the Verified Flip on the admin dropdown.
 */

// classifyEvent / ALLOWED_CATEGORIES / CONFIDENCE_THRESHOLD now live in
// src/lib/eventClassifier.js (imported above) so sync-events can call the
// same classifier inside its Step 4 AI fallback. Behavior here is unchanged.

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventIds } = await request.json();
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return NextResponse.json({ error: 'eventIds[] is required' }, { status: 400 });
  }

  // Hard cap to prevent runaway spend. Admin UI should batch itself anyway.
  const ids = eventIds.slice(0, 100);

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Perplexity API key not configured' }, { status: 500 });
  }

  const supabase = getAdminClient();

  // Pull all requested events in one query — cheaper than N round-trips and
  // lets us apply the Safety filter before any LLM spend.
  const { data: events, error: fetchErr } = await supabase
    .from('events')
    .select('id, title, artist_name, venue_name, event_date, description, custom_description, category, template_id, is_category_verified, category_source, artist_id')
    .in('id', ids);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // ── Confidence Cascade Tier 2 prefetch ────────────────────────────────
  // Batch-load bio + genres for every linked artist on this run so we can
  // inject context into the LLM prompt without per-event round-trips. We
  // skip artists that have a default_category set — those events should
  // never reach the AI in the first place (the sync-events bypass handled
  // them) but we add an in-loop guard below as defense-in-depth.
  const artistIds = [...new Set((events || []).map(e => e.artist_id).filter(Boolean))];
  const artistContextMap = {};
  if (artistIds.length > 0) {
    const { data: artistRows } = await supabase
      .from('artists')
      .select('id, bio, genres, default_category')
      .in('id', artistIds);
    for (const a of (artistRows || [])) {
      artistContextMap[a.id] = a;
    }
  }

  const results = {
    processed: 0,
    updated: 0,
    flagged: 0,
    skipped_verified: 0,
    skipped_template: 0,
    skipped_artist_default: 0,
    context_injected: 0,
    failed: 0,
    rows: [],
  };

  for (const ev of (events || [])) {
    // ── G Spot §1: Safety ─────────────────────────────────────────────────
    // Chain of Command (highest precedence first):
    //   1. Templates (template_id)               → skip
    //   2. Already verified (is_cat_verified)    → skip
    //   3. Inherited from artist_default         → skip
    //   4. Linked artist with default_category   → skip (defense-in-depth;
    //      the sync-events bypass should already have stamped this event)
    //   5. Otherwise → AI classify, with optional context injection
    if (ev.template_id) {
      results.skipped_template++;
      results.rows.push({ id: ev.id, outcome: 'skipped_template' });
      continue;
    }
    if (ev.is_category_verified) {
      results.skipped_verified++;
      results.rows.push({ id: ev.id, outcome: 'skipped_verified' });
      continue;
    }
    if (ev.category_source === 'artist_default') {
      results.skipped_artist_default++;
      results.rows.push({ id: ev.id, outcome: 'skipped_artist_default' });
      continue;
    }
    const linkedArtist = ev.artist_id ? artistContextMap[ev.artist_id] : null;
    if (linkedArtist?.default_category) {
      // Belt-and-suspenders: an admin set a default but the sync hadn't
      // run yet for this event. Don't burn an LLM call — let the next
      // sync apply the bypass.
      results.skipped_artist_default++;
      results.rows.push({ id: ev.id, outcome: 'skipped_artist_default_pending' });
      continue;
    }

    results.processed++;

    // Tier 2: inject artist context if we have it (no default_category but
    // we do have a bio/genres to anchor the model).
    const artistContext = linkedArtist && (linkedArtist.bio || (Array.isArray(linkedArtist.genres) && linkedArtist.genres.length > 0))
      ? { bio: linkedArtist.bio, genres: linkedArtist.genres }
      : null;
    if (artistContext) results.context_injected++;

    const ai = await classifyEvent(ev, apiKey, artistContext);
    if (!ai) {
      results.failed++;
      results.rows.push({ id: ev.id, outcome: 'llm_failed' });
      continue;
    }

    // ── G Spot §3: Enum Prison ────────────────────────────────────────────
    const category = ALLOWED_CATEGORIES.includes(ai.category) ? ai.category : null;
    const confidence = Math.max(0, Math.min(1, Number(ai.confidence) || 0));

    // ── G Spot §4: Confidence Bar ─────────────────────────────────────────
    if (!category || confidence < CONFIDENCE_THRESHOLD) {
      // Flag for Manual Review. Category is NOT overwritten — the existing
      // value (or null) stays so the triage queue still surfaces it.
      const { error: flagErr } = await supabase
        .from('events')
        .update({
          category_source: 'manual_review',
          category_confidence: confidence,
          category_ai_flagged_at: new Date().toISOString(),
          triage_status: 'pending',
        })
        .eq('id', ev.id);

      if (flagErr) {
        results.failed++;
        results.rows.push({ id: ev.id, outcome: 'flag_write_failed', error: flagErr.message });
      } else {
        results.flagged++;
        results.rows.push({ id: ev.id, outcome: 'flagged_manual_review', confidence, suggested: ai.category });
      }
      continue;
    }

    // ── Happy path: high-confidence + whitelisted category → write it ────
    // Never writes is_category_verified=true. Only humans verify.
    const { error: updErr } = await supabase
      .from('events')
      .update({
        category,
        category_source: 'ai',
        category_confidence: confidence,
        category_ai_flagged_at: null,
        triage_status: 'reviewed',
      })
      .eq('id', ev.id);

    if (updErr) {
      results.failed++;
      results.rows.push({ id: ev.id, outcome: 'update_failed', error: updErr.message });
    } else {
      results.updated++;
      results.rows.push({ id: ev.id, outcome: 'updated', category, confidence });
    }

    // Gentle rate limit — 200ms between Perplexity calls.
    await new Promise(r => setTimeout(r, 200));
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({ success: true, ...results });
}
