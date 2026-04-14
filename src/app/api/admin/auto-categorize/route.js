import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

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

const ALLOWED_CATEGORIES = ['Live Music', 'Trivia', 'Karaoke', 'DJ/Dance Party', 'Comedy', 'Other'];
const CONFIDENCE_THRESHOLD = 0.85;

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * Ask Perplexity to classify a single event. Returns { category, confidence,
 * reasoning } or null on transport/parse failure.
 *
 * Prompt is strict JSON only — markdown fences and prose are stripped before
 * parsing, but temperature 0 + the "JSON only" instruction keeps drift low.
 */
async function classifyEvent(ev, apiKey) {
  const system = `You are an event-classification engine for a Jersey Shore live-events site. Categorize each event into EXACTLY ONE of these categories:

${ALLOWED_CATEGORIES.map(c => `- ${c}`).join('\n')}

Rules:
1. You MUST pick from the list above — do not invent new categories.
2. "Live Music" = any performance by a band, solo artist, DJ-as-performer, open mic, jam night, or tribute act.
3. "DJ/Dance Party" = DJ-driven dance events, club nights, silent disco (NOT a DJ performing original music — that's Live Music).
4. "Trivia" = pub trivia, bar trivia, quiz night.
5. "Karaoke" = karaoke nights.
6. "Comedy" = stand-up, improv, comedy shows.
7. "Other" = food/drink specials, sports watch parties, themed nights, anything that doesn't fit the above.
8. Also return a confidence score from 0.0 to 1.0 reflecting how certain you are.

Respond with strict JSON only — no markdown, no code fences, no commentary:
{ "category": "string", "confidence": number, "reasoning": "string" }`;

  const user = `Title: ${ev.title || '(none)'}
Artist: ${ev.artist_name || '(none)'}
Venue: ${ev.venue_name || '(none)'}
Date: ${ev.event_date || '(none)'}
Description: ${(ev.description || ev.custom_description || '').slice(0, 500) || '(none)'}

Classify this event.`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 200,
        temperature: 0.0,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      category: typeof parsed.category === 'string' ? parsed.category : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return null;
  }
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
    .select('id, title, artist_name, venue_name, event_date, description, custom_description, category, template_id, is_category_verified')
    .in('id', ids);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const results = {
    processed: 0,
    updated: 0,
    flagged: 0,
    skipped_verified: 0,
    skipped_template: 0,
    failed: 0,
    rows: [],
  };

  for (const ev of (events || [])) {
    // ── G Spot §1: Safety ─────────────────────────────────────────────────
    if (ev.is_category_verified) {
      results.skipped_verified++;
      results.rows.push({ id: ev.id, outcome: 'skipped_verified' });
      continue;
    }
    if (ev.template_id) {
      results.skipped_template++;
      results.rows.push({ id: ev.id, outcome: 'skipped_template' });
      continue;
    }

    results.processed++;

    const ai = await classifyEvent(ev, apiKey);
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
