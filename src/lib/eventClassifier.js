// ─────────────────────────────────────────────────────────────────────────
// Shared event classifier — Perplexity-backed category prediction.
//
// Extracted from /api/admin/auto-categorize/route.js so it can be reused
// by sync-events (Step 4 AI fallback). The handler in /api/admin/auto-
// categorize still owns the batch loop, Supabase reads/writes, safety
// gates, and stats — this lib only owns the prompt + LLM call + parsing.
//
// Single source of truth for:
//   • ALLOWED_CATEGORIES — the enum prison the LLM output is whitelisted
//     against. Anything outside this list is dropped.
//   • CONFIDENCE_THRESHOLD — the minimum confidence required to write the
//     category to the row. Below this, the caller should flag for manual
//     review instead of overwriting.
//   • classifyEvent(ev, apiKey, artistContext) — pure function. Returns
//     { category, confidence, reasoning } or null on transport / parse
//     failure. Never throws.
//
// Tuning the threshold or category list here flows through to BOTH the
// admin "AI Categorize" button AND the automatic sync-time fallback.
// ─────────────────────────────────────────────────────────────────────────

export const ALLOWED_CATEGORIES = ['Live Music', 'Trivia', 'Karaoke', 'DJ/Dance Party', 'Comedy', 'Other'];
export const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Ask Perplexity to classify a single event.
 *
 * @param {object} ev  — minimal event shape: { title, artist_name, venue_name,
 *                       event_date, description, custom_description }
 * @param {string} apiKey — Perplexity API key
 * @param {object|null} artistContext — optional { bio, genres } from the
 *                       linked artist row, used to lift confidence on
 *                       generic-name acts (Tier 2 in the Confidence Cascade).
 * @returns {Promise<{category: string|null, confidence: number, reasoning: string}|null>}
 */
export async function classifyEvent(ev, apiKey, artistContext = null) {
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

  // ── Confidence Cascade Tier 2: Context Injection ─────────────────────
  // When an event has a linked artist row but no default_category was set,
  // inject the artist's bio + genres into the prompt. The extra context is
  // usually enough to push confidence above the 0.85 threshold for cases
  // that would otherwise drop into Manual Review (e.g. a generic name like
  // "Frankie" with a known acoustic-rock bio).
  const artistContextBlock = artistContext ? `

Known Artist Context (from artists table):
- Bio: ${(artistContext.bio || '(none)').slice(0, 400)}
- Genres: ${Array.isArray(artistContext.genres) && artistContext.genres.length > 0 ? artistContext.genres.join(', ') : '(none)'}` : '';

  const user = `Title: ${ev.title || '(none)'}
Artist: ${ev.artist_name || '(none)'}
Venue: ${ev.venue_name || '(none)'}
Date: ${ev.event_date || '(none)'}
Description: ${(ev.description || ev.custom_description || '').slice(0, 500) || '(none)'}${artistContextBlock}

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
